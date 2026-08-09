import {
  isApiMode,
  isMockMode,
  resolveAccentOracleMode,
  type AccentOracleMode,
} from "./devFlags";
import { getEvidenceBand } from "./evidenceBand";

export const DIALECT_ZONES = [
  "balearic",
  "central",
  "northern",
  "northwestern",
  "valencian",
] as const;

export type DialectZone = (typeof DIALECT_ZONES)[number];

export type SelfReportedDialect = DialectZone | "mixed" | "unknown";

export type EvidenceBand = "limited" | "moderate" | "strong";

export type AccentScores = Record<DialectZone, number>;

export interface RegionalHeatPoint {
  lat: number;
  lng: number;
  weight: number;
  label?: string;
}

export interface AccentOracleResult {
  scores: AccentScores;
  regionalHeatPoints?: RegionalHeatPoint[];
  topLabel: DialectZone;
  runnerUpLabel: DialectZone;
  topTwoGap: number;
  isAmbiguousTopTwo: boolean;
  evidenceBand: EvidenceBand;
  confidenceSummary: string;
  interpretation: string;
  recordingId?: string;
  analysisSessionId?: string;
  takeIndex?: number;
}

export interface FeedbackPayload {
  /** Returned by an earlier `/feedback` call; updates that row instead of adding one. */
  feedbackId?: string;
  recordingId?: string;
  analysisSessionId?: string;
  wasCorrect?: boolean | null;
  selfReportedDialect?: SelfReportedDialect;
  /** @deprecated Prefer ``comarques``; still accepted by the API as a single slug. */
  comarca?: string;
  /** Self-declared comarca slug(s) from the results funnel. */
  comarques?: string[];
  notes?: string;
}

export interface FeedbackResponse {
  feedbackId: string;
}

export const DIALECT_ZONE_LABELS: Record<DialectZone, string> = {
  balearic: "Balear",
  central: "Central",
  northern: "Nord",
  northwestern: "Nord-occidental",
  valencian: "Valencià",
};

export const SELF_REPORTED_DIALECT_LABELS: Record<SelfReportedDialect, string> = {
  ...DIALECT_ZONE_LABELS,
  mixed: "Mixt / de frontera",
  unknown: "No ho sé",
};

export type AnalyzePromptMeta = {
  promptId: string;
  promptText: string;
};

export interface AccentOracleClient {
  analyzeRecording(
    audio: Blob,
    prompt: AnalyzePromptMeta,
    analysisSessionId?: string,
  ): Promise<AccentOracleResult>;
}

const API_BASE_URL = import.meta.env.VITE_ACCENT_ORACLE_API_URL ?? "http://localhost:8000";

/** Client-side fetch timeout for `/analyze` (CPU HuBERT can be slow). */
const ANALYZE_TIMEOUT_MS = 120_000;

const SERVICE_SATURATED_MESSAGE = "El servei està saturat. Torna-ho a provar.";
const ANALYZE_TIMEOUT_MESSAGE = "La petició ha trigat massa. Torna-ho a provar.";
const NETWORK_ERROR_MESSAGE =
  "No s'ha pogut connectar amb el servidor. Comprova la connexió i torna-ho a provar.";
const RATE_LIMIT_MESSAGE = "Has fet massa peticions. Espera un moment i torna-ho a provar.";
const SERVER_ERROR_MESSAGE =
  "El servidor ha tingut un problema. Torna-ho a provar d'aquí a uns minuts.";
const PAYLOAD_TOO_LARGE_MESSAGE = "La gravació és massa gran. Prova una mostra més curta.";

/** True for browser network failures (offline, CORS, DNS, etc.). */
export function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed")
  );
}

/** Map AbortError / network TypeError to Catalan Error; otherwise null. */
export function mapTransportError(
  error: unknown,
  timeoutMessage: string = ANALYZE_TIMEOUT_MESSAGE,
): Error | null {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error(timeoutMessage, { cause: error });
  }
  if (isNetworkFetchError(error)) {
    return new Error(NETWORK_ERROR_MESSAGE, { cause: error });
  }
  return null;
}

/** Status-based Catalan fallback (avoids English / field-name validation dumps). */
export function friendlyHttpFallback(status: number, fallback: string): string {
  if (status === 413) {
    return PAYLOAD_TOO_LARGE_MESSAGE;
  }
  if (status === 429) {
    return RATE_LIMIT_MESSAGE;
  }
  if (status === 503) {
    return SERVICE_SATURATED_MESSAGE;
  }
  if (status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }
  return fallback;
}

function looksLikeApiValidationDetail(detail: unknown): boolean {
  if (Array.isArray(detail)) {
    return true;
  }
  if (typeof detail !== "string") {
    return true;
  }
  const lower = detail.toLowerCase();
  return (
    lower.includes("value_error") ||
    lower.includes("type_error") ||
    lower.includes("field required") ||
    lower.includes("ensure this value") ||
    /\btraceback\b/.test(lower) ||
    detail.trim().startsWith("{") ||
    detail.trim().startsWith("[")
  );
}

/** Prefer short Catalan backend detail; otherwise status fallback. */
export function resolveApiErrorMessage(
  status: number,
  detail: unknown,
  fallback: string,
): string {
  const statusFallback = friendlyHttpFallback(status, fallback);
  if (status === 413 || status === 429 || status === 503 || status >= 500) {
    return statusFallback;
  }
  if (typeof detail === "string" && detail.trim() && !looksLikeApiValidationDetail(detail)) {
    return detail.trim();
  }
  return statusFallback;
}

/** Uncertain first take (fails needsValidation). */
const MOCK_FAIL_TAKE_1: AccentScores = {
  balearic: 0.1,
  central: 0.38,
  northern: 0.32,
  northwestern: 0.1,
  valencian: 0.1,
};

/** Disagreeing second take (different top → average stays soft). */
const MOCK_FAIL_TAKE_2: AccentScores = {
  balearic: 0.1,
  central: 0.28,
  northern: 0.1,
  northwestern: 0.12,
  valencian: 0.4,
};

/** Optional third: soft confirmation toward central. */
const MOCK_FAIL_TAKE_3: AccentScores = {
  balearic: 0.08,
  central: 0.42,
  northern: 0.2,
  northwestern: 0.15,
  valencian: 0.15,
};

/**
 * Clear first-take profiles (each skips validation: top ≥ 0.50, gap ≥ 0.15).
 * Rotated across analyzes so mock-success is not stuck on one dialect.
 */
const MOCK_SUCCESS_PROFILES: AccentScores[] = [
  {
    balearic: 0.08,
    central: 0.55,
    northern: 0.12,
    northwestern: 0.13,
    valencian: 0.12,
  },
  {
    balearic: 0.07,
    central: 0.11,
    northern: 0.1,
    northwestern: 0.12,
    valencian: 0.6,
  },
  {
    balearic: 0.58,
    central: 0.12,
    northern: 0.1,
    northwestern: 0.1,
    valencian: 0.1,
  },
  {
    balearic: 0.08,
    central: 0.12,
    northern: 0.14,
    northwestern: 0.54,
    valencian: 0.12,
  },
  {
    balearic: 0.09,
    central: 0.13,
    northern: 0.52,
    northwestern: 0.14,
    valencian: 0.12,
  },
];

let mockAnalyzeOrdinal = 0;
/** Survives flow resets so successive mock-success runs cycle winners. */
let mockSuccessCursor = 0;

/** Reset deterministic mock-fail take counter (call when starting a new recording flow). */
export function resetMockAnalyzeOrdinal(): void {
  mockAnalyzeOrdinal = 0;
}

export function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeScores(scores: AccentScores): AccentScores {
  const total = DIALECT_ZONES.reduce((sum, label) => sum + scores[label], 0);

  return DIALECT_ZONES.reduce((normalized, label) => {
    normalized[label] = Number((scores[label] / total).toFixed(3));
    return normalized;
  }, {} as AccentScores);
}

function summarizeConfidence(evidenceBand: EvidenceBand, isAmbiguousTopTwo: boolean): string {
  if (isAmbiguousTopTwo) {
    return "Les dues zones principals són properes, així que el mapa mostra un patró de similitud més ampli.";
  }

  if (evidenceBand === "strong") {
    return "El senyal simulat és relativament concentrat, però encara no és una estimació exacta d'origen.";
  }

  if (evidenceBand === "moderate") {
    return "El senyal simulat detecta una zona principal amb incertesa significativa al voltant.";
  }

  return "La gravació aporta evidència limitada, així que la incertesa és alta.";
}

/** Build a full result from a score vector (used by mock client and validation merge). */
export function buildResultFromScores(
  rawScores: AccentScores,
  recordingId?: string,
  analysisSessionId?: string,
  takeIndex?: number,
): AccentOracleResult {
  const scores = normalizeScores(rawScores);
  const ranked = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const topLabel = ranked[0];
  const runnerUpLabel = ranked[1];
  const topTwoGap = Number((scores[topLabel] - scores[runnerUpLabel]).toFixed(3));
  const isAmbiguousTopTwo = topTwoGap < 0.08;
  const evidenceBand = getEvidenceBand(topTwoGap, scores[topLabel]);

  return {
    scores,
    topLabel,
    runnerUpLabel,
    topTwoGap,
    isAmbiguousTopTwo,
    evidenceBand,
    confidenceSummary: summarizeConfidence(evidenceBand, isAmbiguousTopTwo),
    interpretation: `Aquesta gravació sona més similar a les zones catalanes ${DIALECT_ZONE_LABELS[topLabel].toLowerCase()} segons el model simulat actual.`,
    recordingId,
    analysisSessionId,
    takeIndex,
  };
}

function scoresForMockMode(mode: AccentOracleMode, takeIndex: number): AccentScores {
  if (mode === "mock-success") {
    const profile = MOCK_SUCCESS_PROFILES[mockSuccessCursor % MOCK_SUCCESS_PROFILES.length];
    mockSuccessCursor += 1;
    return { ...profile };
  }

  if (takeIndex <= 1) {
    return { ...MOCK_FAIL_TAKE_1 };
  }
  if (takeIndex === 2) {
    return { ...MOCK_FAIL_TAKE_2 };
  }
  return { ...MOCK_FAIL_TAKE_3 };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    return resolveApiErrorMessage(response.status, payload.detail, fallback);
  } catch {
    // Keep the status-based message if the backend did not return JSON.
  }
  return friendlyHttpFallback(response.status, fallback);
}

export const mockAccentOracleClient: AccentOracleClient = {
  async analyzeRecording(
    audio: Blob,
    prompt: AnalyzePromptMeta,
    analysisSessionId?: string,
  ): Promise<AccentOracleResult> {
    void audio;
    void prompt;
    await new Promise((resolve) => window.setTimeout(resolve, 650));

    mockAnalyzeOrdinal += 1;
    const mode = resolveAccentOracleMode();
    const scores = scoresForMockMode(mode, mockAnalyzeOrdinal);
    return buildResultFromScores(
      scores,
      createClientId(),
      analysisSessionId,
      mockAnalyzeOrdinal,
    );
  },
};

export const apiAccentOracleClient: AccentOracleClient = {
  async analyzeRecording(
    audio: Blob,
    prompt: AnalyzePromptMeta,
    analysisSessionId?: string,
  ): Promise<AccentOracleResult> {
    const formData = new FormData();
    const filename = audio instanceof File ? audio.name : "recording.webm";
    formData.append("audio", audio, filename);
    formData.append("promptId", prompt.promptId);
    formData.append("promptText", prompt.promptText);
    if (analysisSessionId) {
      formData.append("analysisSessionId", analysisSessionId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (error) {
      const mapped = mapTransportError(error);
      if (mapped) {
        throw mapped;
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "L'API del model no ha pogut analitzar aquesta gravació."),
      );
    }
    return (await response.json()) as AccentOracleResult;
  },
};

export interface AnalysisFinalizePayload {
  analysisSessionId: string;
  finalResult: AccentOracleResult;
  takeCount: number;
  terminalState: "results" | "skipped-third" | "unresolved";
}

export interface AnalysisFinalizeResponse {
  analysisSessionId: string;
  finalized: boolean;
}

export async function finalizeAnalysis(
  payload: AnalysisFinalizePayload,
): Promise<AnalysisFinalizeResponse> {
  if (isMockMode(getAccentOracleMode())) {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return {
      analysisSessionId: payload.analysisSessionId,
      finalized: true,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/analysis-finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const mapped = mapTransportError(error);
    if (mapped) {
      throw mapped;
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "No s'ha pogut desar el resultat."));
  }
  return (await response.json()) as AnalysisFinalizeResponse;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  if (isMockMode(getAccentOracleMode())) {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    return { feedbackId: payload.feedbackId ?? createClientId() };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const mapped = mapTransportError(error);
    if (mapped) {
      throw mapped;
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "No s'ha pogut enviar el comentari."));
  }
  return (await response.json()) as FeedbackResponse;
}

export interface ResearchConsentPayload {
  recordingId?: string;
  analysisSessionId?: string;
  consent: boolean;
  ageConfirmed?: boolean;
  policyVersion?: string;
}

export interface ResearchConsentResponse {
  recordingId?: string;
  analysisSessionId?: string;
  researchConsent: boolean;
}

export async function submitResearchConsent(
  payload: ResearchConsentPayload,
): Promise<ResearchConsentResponse> {
  if (isMockMode(getAccentOracleMode())) {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    return {
      recordingId: payload.recordingId,
      analysisSessionId: payload.analysisSessionId,
      researchConsent: payload.consent,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/research-consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingId: payload.recordingId,
        analysisSessionId: payload.analysisSessionId,
        consent: payload.consent,
        ageConfirmed: payload.ageConfirmed ?? false,
        policyVersion: payload.policyVersion,
      }),
    });
  } catch (error) {
    const mapped = mapTransportError(error);
    if (mapped) {
      throw mapped;
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "No s'ha pogut desar l'elecció de consentiment."),
    );
  }
  return (await response.json()) as ResearchConsentResponse;
}

export function getAccentOracleClient(): AccentOracleClient {
  return isApiMode(getAccentOracleMode()) ? apiAccentOracleClient : mockAccentOracleClient;
}

export function getAccentOracleMode(): AccentOracleMode {
  return resolveAccentOracleMode();
}
