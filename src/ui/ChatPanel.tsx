import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHIPS, tx } from "../i18n/copy.ts";
import { interpretCommand } from "../parser/interpreter.ts";
import { useLab } from "../store/labStore.ts";

export function ChatPanel() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const chat = useLab((s) => s.chat);
  const design = useLab((s) => s.design);
  const selected = useLab((s) => s.selected);
  const pushChat = useLab((s) => s.pushChat);
  const applyCommands = useLab((s) => s.applyCommands);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);

  async function submit(value: string) {
    const utterance = value.trim();
    if (!utterance) return;
    setText("");
    pushChat({ id: `u-${Date.now()}`, role: "user", text: utterance });
    const result = await interpretCommand(utterance, {
      lang,
      selected,
      bottleId: design.bottle.variantId,
      capId: design.cap.variantId,
      labelId: design.label.variantId,
      pumpId: design.pump.variantId,
      collarId: design.collar.variantId,
      boxId: design.box.variantId,
    });
    applyCommands(result.commands);
    pushChat({ id: `l-${Date.now()}`, role: "lab", he: result.reply.he, en: result.reply.en });
  }

  function listen() {
    const ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!ctor) {
      pushChat({ id: `l-${Date.now()}`, role: "lab", he: t.voiceUnsupported, en: t.voiceUnsupported });
      return;
    }
    const rec = new ctor();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setListening(false);
      if (transcript) void submit(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <section className="panel chat" dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.commands}</h2>
      </div>
      <div className="transcript">
        {chat.length === 0 && (
          <div className="chips examples">
            {CHIPS[lang].map((chip) => (
              <button key={chip} type="button" onClick={() => void submit(chip)}>{chip}</button>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {chat.map((message) => (
            <motion.p
              key={message.id}
              className={message.role === "user" ? "msg user" : "msg lab"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {message.role === "user" ? message.text : lang === "he" ? message.he : message.en}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text);
        }}
      >
        <button type="button" className={listening ? "mic is-on" : "mic"} onClick={listen} aria-label={t.listening}>
          {listening ? "●" : "🎙"}
        </button>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={t.chatPlaceholder} />
        <button type="submit">{t.send}</button>
      </form>
    </section>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
