export type VoiceVariant = 1 | 2 | 3;

export function parseVoiceParam(value: string | null): VoiceVariant {
  if (value === "2") return 2;
  if (value === "3") return 3;
  return 1;
}

export function readVoiceParam(): VoiceVariant {
  if (typeof location === "undefined") return 1;
  return parseVoiceParam(new URLSearchParams(location.search).get("voice"));
}

/** Pull the command that follows מעבדה / מעבדת / lab. Hebrew has no ASCII word boundary. */
export function extractAfterWake(text: string): { woke: boolean; command: string } {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = /(^|[\s,.:])(?:ה)?(מעבדת|מעבדה|lab)(?=$|[\s,.:])/i.exec(cleaned);
  if (!match || match.index === undefined) return { woke: false, command: "" };
  const start = match.index + match[0].length;
  const command = cleaned.slice(start).replace(/^[\s,.:\-–]+/, "").trim();
  return { woke: true, command };
}
