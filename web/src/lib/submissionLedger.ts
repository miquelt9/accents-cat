export type LedgerEntryKind = "recording" | "feedback";

export interface LedgerEntry {
  id: string;
  kind: LedgerEntryKind;
  at: string;
}

const STORAGE_KEY = "accent-oracle-submission-ledger";
const MAX_ENTRIES = 50;

function readEntries(): LedgerEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is LedgerEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LedgerEntry).id === "string" &&
        ((entry as LedgerEntry).kind === "recording" || (entry as LedgerEntry).kind === "feedback") &&
        typeof (entry as LedgerEntry).at === "string",
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: LedgerEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export function getLedgerEntries(): LedgerEntry[] {
  return readEntries();
}

export function getRecordingIds(): string[] {
  return readEntries()
    .filter((entry) => entry.kind === "recording")
    .map((entry) => entry.id);
}

export function getFeedbackIds(): string[] {
  return readEntries()
    .filter((entry) => entry.kind === "feedback")
    .map((entry) => entry.id);
}

export function appendLedgerEntry(id: string, kind: LedgerEntryKind): void {
  if (!id) {
    return;
  }

  const entries = readEntries();
  if (entries.some((entry) => entry.id === id && entry.kind === kind)) {
    return;
  }

  entries.push({ id, kind, at: new Date().toISOString() });
  writeEntries(entries);
}
