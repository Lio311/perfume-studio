import { useEffect, useRef, useState } from "react";
import { tx } from "../i18n/copy.ts";
import { submitUtterance } from "../audio/command.ts";
import { recognitionCtor, transcriptOf, type SpeechRec } from "../audio/speech.ts";
import { useLab } from "../store/labStore.ts";

export function VoiceAssistant() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const chat = useLab((s) => s.chat);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const heardRef = useRef("");
  const stopOnce = useRef(false);

  function start(event?: React.PointerEvent) {
    if (recRef.current) return;
    event?.currentTarget.setPointerCapture(event.pointerId);
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setLive(t.voiceUnsupported);
      return;
    }
    const rec = new Ctor();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (speech) => {
      const text = transcriptOf(speech);
      heardRef.current = text;
      setLive(text);
    };
    rec.onerror = (speech) => {
      if (speech.error === "not-allowed" || speech.error === "service-not-allowed") setLive(t.voiceUnsupported);
    };
    recRef.current = rec;
    stopOnce.current = false;
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }

  function stop() {
    if (stopOnce.current) return;
    const rec = recRef.current;
    if (!rec) return;
    stopOnce.current = true;
    recRef.current = null;
    setListening(false);
    try {
      rec.stop();
    } catch {
      /* already ended */
    }
    window.setTimeout(() => {
      const text = heardRef.current.trim();
      heardRef.current = "";
      if (text) void submitUtterance(text, { speak: true, hebrew: true });
    }, 180);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || event.repeat || event.code !== "Space") return;
      event.preventDefault();
      start();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") stop();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, [lang]);

  const last = [...chat].reverse().find((message) => message.role === "lab");
  const caption = listening ? live || t.listening : live || (last ? (lang === "he" ? last.he : last.en) : t.holdToTalk);

  return (
    <div className="voice-assistant" data-variant="1">
      <p className="live-caption" dir={lang === "he" ? "rtl" : "ltr"}>{caption}</p>
      <button
        type="button"
        className={listening ? "ptt is-hot" : "ptt"}
        aria-pressed={listening}
        aria-label={t.holdToTalk}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <span className="ptt-core" />
      </button>
      <span className="ptt-hint">{t.pttHint}</span>
    </div>
  );
}
