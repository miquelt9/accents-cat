import { isDevToolsEnabled, resolveAccentOracleMode } from "./devFlags";
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
}

export interface FeedbackPayload {
  recordingId: string;
  wasCorrect: boolean | null;
  selfReportedDialect?: SelfReportedDialect;
  notes?: string;
}

export interface FeedbackResponse {
  feedbackId: string;
}

export interface ClientInfo {
  ip: string;
  userAgent: string;
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
  analyzeRecording(audio: Blob, prompt: AnalyzePromptMeta): Promise<AccentOracleResult>;
}

const API_BASE_URL = import.meta.env.VITE_ACCENT_ORACLE_API_URL ?? "http://localhost:8000";

/** Client-side fetch timeout for `/analyze` (CPU HuBERT can be slow). */
const ANALYZE_TIMEOUT_MS = 120_000;

const SERVICE_SATURATED_MESSAGE = "El servei està saturat. Torna-ho a provar.";
const ANALYZE_TIMEOUT_MESSAGE = "La petició ha trigat massa. Torna-ho a provar.";

const BASE_PROFILE: AccentScores = {
  balearic: 0.18,
  central: 0.27,
  northern: 0.14,
  northwestern: 0.2,
  valencian: 0.21,
};

const DEV_SMOKE_SPOTLIGHTS: DialectZone[] = [
  "central",
  "valencian",
  "northwestern",
  "northern",
  "balearic",
];

let mockInvocationSeq = 0;

function isDevMockVariationEnabled(): boolean {
  return import.meta.env.DEV;
}

export function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeScores(scores: AccentScores): AccentScores {
  const total = DIALECT_ZONES.reduce((sum, label) => sum + scores[label], 0);

  return DIALECT_ZONES.reduce((normalized, label) => {
    normalized[label] = Number((scores[label] / total).toFixed(3));
    return normalized;
  }, {} as AccentScores);
}

function seededNoise(seed: number, index: number): number {
  const value = Math.sin(seed * (index + 3) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function buildMockScores(audio: Blob): AccentScores {
  const audioSeed = Math.max(audio.size, 1) + audio.type.length * 97;
  const scores = { ...BASE_PROFILE };

  let seed = audioSeed;
  if (isDevMockVariationEnabled()) {
    mockInvocationSeq += 1;
    seed = audioSeed + mockInvocationSeq * 7919 + (performance.now() * 1000) % 97_003;
    const spotlight = DEV_SMOKE_SPOTLIGHTS[(mockInvocationSeq - 1) % DEV_SMOKE_SPOTLIGHTS.length];
    scores[spotlight] += 0.24;
  }

  const noiseAmplitude = isDevMockVariationEnabled() ? 0.2 : 0.12;
  DIALECT_ZONES.forEach((label, index) => {
    scores[label] += (seededNoise(seed, index) - 0.5) * noiseAmplitude;
  });

  return normalizeScores(scores);
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

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      return payload.detail;
    }
  } catch {
    // Keep the generic message if the backend did not return JSON.
  }
  return fallback;
}

export const mockAccentOracleClient: AccentOracleClient = {
  async analyzeRecording(audio: Blob, prompt: AnalyzePromptMeta): Promise<AccentOracleResult> {
    void prompt;
    await new Promise((resolve) => window.setTimeout(resolve, 650));

    const scores = buildMockScores(audio);
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
      recordingId: createClientId(),
    };
  },
};

export const apiAccentOracleClient: AccentOracleClient = {
  async analyzeRecording(audio: Blob, prompt: AnalyzePromptMeta): Promise<AccentOracleResult> {
    const formData = new FormData();
    const filename = audio instanceof File ? audio.name : "recording.webm";
    formData.append("audio", audio, filename);
    formData.append("promptId", prompt.promptId);
    formData.append("promptText", prompt.promptText);

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
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(ANALYZE_TIMEOUT_MESSAGE, { cause: error });
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (response.status === 503) {
      throw new Error(SERVICE_SATURATED_MESSAGE);
    }
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "L'API del model no ha pogut analitzar aquesta gravació."),
      );
    }
    return (await response.json()) as AccentOracleResult;
  },
};

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  if (getAccentOracleMode() === "mock") {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    return { feedbackId: createClientId() };
  }

  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "No s'ha pogut enviar el comentari."));
  }
  return (await response.json()) as FeedbackResponse;
}

export interface ResearchConsentPayload {
  recordingId: string;
  consent: boolean;
  ageConfirmed?: boolean;
  policyVersion?: string;
}

export interface ResearchConsentResponse {
  recordingId: string;
  researchConsent: boolean;
}

export async function submitResearchConsent(
  payload: ResearchConsentPayload,
): Promise<ResearchConsentResponse> {
  if (getAccentOracleMode() === "mock") {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    return {
      recordingId: payload.recordingId,
      researchConsent: payload.consent,
    };
  }

  const response = await fetch(`${API_BASE_URL}/research-consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recordingId: payload.recordingId,
      consent: payload.consent,
      ageConfirmed: payload.ageConfirmed ?? false,
      policyVersion: payload.policyVersion,
    }),
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "No s'ha pogut desar l'elecció de consentiment."),
    );
  }
  return (await response.json()) as ResearchConsentResponse;
}

export async function fetchClientInfo(): Promise<ClientInfo> {
  if (getAccentOracleMode() === "mock") {
    return {
      ip: isDevToolsEnabled() ? "no disponible (mode mock)" : "no disponible",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };
  }

  const response = await fetch(`${API_BASE_URL}/client-info`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "No s'ha pogut obtenir la informació del client."));
  }
  return (await response.json()) as ClientInfo;
}

export function getAccentOracleClient(): AccentOracleClient {
  return getAccentOracleMode() === "api" ? apiAccentOracleClient : mockAccentOracleClient;
}

export function getAccentOracleMode(): "api" | "mock" {
  return resolveAccentOracleMode();
}
