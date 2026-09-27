export interface SpeechAlt {
  transcript: string;
}

export interface SpeechChunk {
  isFinal: boolean;
  0: SpeechAlt;
}

export interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechChunk>;
}

export interface SpeechErrorEvent {
  error: string;
}

export interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type Ctor = new () => SpeechRec;

export function recognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function transcriptOf(event: SpeechEvent, fromIndex = 0, finalsOnly = false): string {
  let out = "";
  for (let i = fromIndex; i < event.results.length; i++) {
    const chunk = event.results[i];
    if (finalsOnly && !chunk?.isFinal) continue;
    out += chunk?.[0]?.transcript ?? "";
  }
  return out.trim();
}

export function speak(text: string, lang: "he-IL" | "en-US"): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.04;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ?? null;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
