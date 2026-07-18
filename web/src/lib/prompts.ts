/**
 * Short read-aloud prompts for acoustic dialect similarity.
 *
 * Pool targets dialect-sensitive phonology with everyday Catalan lexicon:
 * unstressed vowel reduction vs full vowels, /ʎ/ vs /j/, coda consonants,
 * and common lexical items — not geographic origin cues.
 *
 * Former long primary (kept as design reference only, not shown in UI):
 * "Dissabte al matí, la Júlia va sortir de casa amb una motxilla petita…"
 */

export type ReadAloudPrompt = {
  id: string;
  text: string;
  /** Research note: phonology / lexical targets (not shown to users). */
  notes?: string;
};

export const READ_ALOUD_PROMPTS: readonly ReadAloudPrompt[] = [
  {
    id: "pluja-vinya",
    text: "La pluja fina cau sobre la vinya vella. El vent xiula pels camps buits mentre el sol escalfa la pedra del carrer.",
    notes: "unstressed vowels; /ʎ/ in vella; coda /s/",
  },
  {
    id: "fill-escola",
    text: "El fill petit va a l'escola amb la motxilla plena de llibres. Li agrada llegir sota l'arbre del pati.",
    notes: "/ʎ/ fill·llibre; vowel reduction in articles",
  },
  {
    id: "ull-porta",
    text: "Obre l'ull i mira per la porta del celler. L'avi hi guarda oli, vi i unes ampolles velles.",
    notes: "/ʎ/ ull; open/close mid vowels; finals",
  },
  {
    id: "lluna-platja",
    text: "La lluna brilla sobre la platja quieta. Les onades banyen la sorra i tornen enrere amb calma.",
    notes: "/ʎ/ lluna; /tʃ/ platja; vowel quality",
  },
  {
    id: "fulla-terra",
    text: "Una fulla groga cau a terra prop del pou. El gos la ensuma i corre cap a la casa blanca.",
    notes: "/ʎ/ fulla; schwa vs full vowels in unstressed",
  },
  {
    id: "all-olla",
    text: "Posa l'all a l'olla amb una mica d'oli. Després afegeix-hi ceba, tomàquet i un gra de sal.",
    notes: "/ʎ/ all; mid vowels; geminate cues",
  },
  {
    id: "cavall-muntanya",
    text: "El cavall puja la muntanya per un camí estret. Al cim hi ha un coll amb vistes al riu.",
    notes: "/ʎ/ cavall·coll; unstressed reduction",
  },
  {
    id: "velles-finestres",
    text: "Les finestres velles del castell s'obren amb un crit. Dins fa fred i olor de fusta humida.",
    notes: "/ʎ/ velles·castell; finals; vowel reduction",
  },
  {
    id: "gent-mercat",
    text: "Al mercat hi ha molta gent i fruita fresca. Compra peres, prunes i un tros de formatge.",
    notes: "unstressed vowels; coda clusters; everyday lexicon",
  },
  {
    id: "neu-poble",
    text: "Ahir va nevar al poble i els camps van quedar blancs. Els nens jugaven amb boles de neu al carrer.",
    notes: "diphthongs; unstressed vowels; finals",
  },
  {
    id: "llibre-biblioteca",
    text: "Vaig deixar el llibre a la biblioteca del barri. Demà el tornaré a agafar per acabar-lo.",
    notes: "/ʎ/ llibre; schwa vs full vowels; /ʎ/ biblioteca",
  },
  {
    id: "paella-foc",
    text: "La paella bull a foc lent amb arròs i peix. L'olor arriba fins a la plaça del poble.",
    notes: "open/close mid vowels; /ʎ/ absent contrast with j; coda /s/",
  },
  {
    id: "llum-cambra",
    text: "Apaga el llum de la cambra i tanca la persiana. Fora es sent el cant dels grills.",
    notes: "/ʎ/ llum; vowel reduction; finals",
  },
  {
    id: "vellesa-temps",
    text: "Amb el temps la vellesa arriba a tothom. Cal parlar clar, escoltar bé i tenir paciència.",
    notes: "/ʎ/ vellesa; unstressed vowels; everyday lexicon",
  },
] as const;

const LAST_PROMPT_STORAGE_KEY = "accent-oracle-last-prompt-id";

function randomIndex(length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function pickReadAloudPrompt(excludeIds: readonly string[] = []): ReadAloudPrompt {
  const excluded = new Set(excludeIds);
  const candidates = READ_ALOUD_PROMPTS.filter((prompt) => !excluded.has(prompt.id));
  const pool = candidates.length > 0 ? candidates : [...READ_ALOUD_PROMPTS];
  return pool[randomIndex(pool.length)];
}

/** Prefer avoiding the last session prompt when starting a new primary take. */
export function pickPrimaryReadAloudPrompt(): ReadAloudPrompt {
  const lastId =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LAST_PROMPT_STORAGE_KEY) : null;
  const prompt = pickReadAloudPrompt(lastId ? [lastId] : []);
  rememberLastPromptId(prompt.id);
  return prompt;
}

export function rememberLastPromptId(promptId: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(LAST_PROMPT_STORAGE_KEY, promptId);
}
