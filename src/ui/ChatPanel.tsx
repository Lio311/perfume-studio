import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHIPS, tx } from "../i18n/copy.ts";
import { submitUtterance } from "../audio/command.ts";
import { recognitionCtor, transcriptOf } from "../audio/speech.ts";
import { useLab } from "../store/labStore.ts";

export function ChatPanel() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const chat = useLab((s) => s.chat);
  const pushChat = useLab((s) => s.pushChat);
  const restoreDesign = useLab((s) => s.restoreDesign);
  const voice = useLab((s) => s.voice);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);

  async function submit(value: string) {
    const utterance = value.trim();
    if (!utterance) return;
    setText("");
    await submitUtterance(utterance, { speak: voice === 1 || voice === 2, hebrew: voice === 1 });
  }

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      pushChat({ id: `l-${Date.now()}`, role: "lab", he: t.voiceUnsupported, en: t.voiceUnsupported });
      return;
    }
    const rec = new Ctor();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      const transcript = transcriptOf(event, 0, true) || transcriptOf(event);
      setListening(false);
      if (transcript) void submit(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  return (
    <section className="panel chat" dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.commands}</h2>
      </div>
      <div className="suggest">
        {CHIPS[lang].map((chip) => (
          <button key={chip} type="button" onClick={() => void submit(chip)}>{chip}</button>
        ))}
      </div>
      <div className="transcript">
        <AnimatePresence initial={false}>
          {chat.map((message) => (
            <motion.div
              key={message.id}
              className={message.role === "user" ? "msg-row user" : "msg-row lab"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <p className={message.role === "user" ? "msg user" : "msg lab"}>
                {message.role === "user" ? message.text : lang === "he" ? message.he : message.en}
              </p>
              {message.role === "lab" && message.snapshot && (
                <button type="button" className="undo-chip" onClick={() => restoreDesign(message.snapshot!)}>{t.undoChip}</button>
              )}
            </motion.div>
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
        {voice === 3 && (
          <button type="button" className={listening ? "mic is-on" : "mic"} onClick={listen} aria-label={t.sonicNote}>
            {listening ? "●" : "🎙"}
          </button>
        )}
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={t.chatPlaceholder} />
        <button type="submit">{t.send}</button>
      </form>
    </section>
  );
}
