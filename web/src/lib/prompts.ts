/**
 * Short read-aloud prompts for acoustic dialect similarity.
 *
 * Each prompt carries one dialect-sensitive contrast — [jʃ] before /ʃ/,
 * betacism, apitxat sibilant devoicing, iodització, final consonant clusters,
 * [ɔw] > [aw], unstressed vowel reduction, Balearic stressed schwa, and the
 * mid-vowel open/closed splits — over high-coverage CV26 vocabulary. Lexical
 * variants a speaker would swap out (espill/mirall, moixó) are avoided on
 * purpose: the signal is *how* the same text is read, not which words are
 * chosen, and never a geographic origin cue.
 */

export type ReadAloudPrompt = {
  id: string;
  text: string;
  /** Research note: phonology / lexical targets (not shown to users). */
  notes?: string;
};

export const READ_ALOUD_PROMPTS: readonly ReadAloudPrompt[] = [
  {
    id: "caixa-peix",
    text: "Vaig deixar la caixa del peix damunt la taula de la cuina. La meva cosina en va agafar dos trossos per fer el dinar.",
    notes: "western [jʃ] in deixar·caixa·peix vs eastern [ʃ]; CV26 coverage: dos, fer",
  },
  {
    id: "vaca-vi",
    text: "El meu avi guarda vint ampolles de vi al celler i una vaca vella al prat. Diu que la seva família fa el mateix des de fa cent anys.",
    notes: "betacism [v] vs [b] in avi·vi·vaca·vella; coda -nt in vint·cent; CV26 coverage: vint-i, seva",
  },
  {
    id: "casa-rosa",
    text: "A casa tenim una rosa i dotze gerros a la finestra. La Josefina els rega cada dia abans d'anar a la feina.",
    notes: "apitxat devoicing: [z] casa·rosa, [dz] dotze, [dʒ] gerros·Josefina; CV26 coverage: dia, anar, feina",
  },
  {
    id: "palla-ull",
    text: "Obre l'ull i mira la palla que hi ha sota l'olla. L'abella vola cap a l'orella del cavall.",
    notes: "iodització: [ʎ] > [j] in ull·palla·abella·orella vs stable [ʎ] in olla·cavall",
  },
  {
    id: "camp-vent",
    text: "Al camp bufa molt de vent i el cel és quasi blanc. Vam pujar al cim el vint-i-tres de maig amb quatre amics.",
    notes: "final clusters -mp·-nt·-lt·-nc in camp·vent·molt·blanc; CV26 coverage: molt, vint-i, tres, quatre, maig",
  },
  {
    id: "pou-ou",
    text: "Vora el pou hi ha un ou trencat i dos gats que dormen. El nou hort del meu germà queda just darrere la font.",
    notes: "alacantí [ɔw] > [aw] in pou·ou·nou; open/close mid vowels in hort·font; CV26 coverage: dos",
  },
  {
    id: "cotxe-poble",
    text: "El cotxe puja pel camí del poble quan surt el sol. A la porta de l'església hi ha molta gent esperant el metge.",
    notes: "unstressed reduction: eastern [ə] in camí·esperant and final -e of cotxe·metge vs western [a]/[e]; CV26 coverage: gent, molt",
  },
  {
    id: "cera-pera",
    text: "La meva mare va comprar una pera, un tros de formatge i una espelma de cera. Tot plegat li va costar quinze euros.",
    notes: "balearic stressed schwa in cera (CERA) and pera (PIRA); unstressed a/e neutralisation in mare·espelma·plegat",
  },
  {
    id: "primer-fred",
    text: "El primer dia de gener fa fred i el camí queda gelat. Hem fet foc a la llar i hem menjat pa amb formatge.",
    notes: "stressed mid front vowels [e]/[ɛ]/balearic [ə] in primer·gener·fred; CV26 coverage: primer, dia",
  },
  {
    id: "nom-tren",
    text: "Digues el teu nom i l'hora que arribarà el tren. Hi ha quatre persones esperant a l'andana des de les cinc.",
    notes: "stressed [ɔ] vs [o] in nom·hora·persones; CV26 coverage: nom, persones, hora, quatre, cinc, tren",
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
