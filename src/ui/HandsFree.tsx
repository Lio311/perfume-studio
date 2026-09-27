import { useEffect, useRef, useState } from "react";
import { tx } from "../i18n/copy.ts";
import { submitUtterance } from "../audio/command.ts";
import { speak, stopSpeaking, recognitionCtor, transcriptOf, type SpeechRec } from "../audio/speech.ts";
import { extractAfterWake } from "../audio/wake.ts";
import type { PartKey } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const TOUR: Array<{ part: PartKey | null; explode: number; he: string; en: string }> = [
  { part: "bottle", explode: 0.18, he: "זה הבקבוק. קארה חמישים מיליליטר, צוואר פיאה חמש עשרה.", en: "This is the bottle. Cara fifty millilitres, FEA fifteen neck." },
  { part: "collar", explode: 0.38, he: "הצווארון נצמד לחבק שעל הצוואר.", en: "The collar seats on the neck ferrule." },
  { part: "pump", explode: 0.55, he: "המשאבה יושבת על הצוואר, מתחת לפקק.", en: "The pump sits on the neck, under the cap." },
  { part: "cap", explode: 0.72, he: "הפקק מכסה את הצווארון. כאן זו קוביית זהב.", en: "The cap covers the collar. This one is a gold cube." },
  { part: "label", explode: 0.78, he: "הסימון על הזכוכית נושא את שם המותג.", en: "The mark on the glass carries the brand." },
  { part: "box", explode: 0.9, he: "הקופסה עומדת לצד הבקבוק.", en: "The box stands beside the bottle." },
  { part: null, explode: 0, he: "ועכשיו הכל חוזר למקומו.", en: "And now everything settles back together." },
];

export function HandsFree() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const [armed, setArmed] = useState(false);
  const [awake, setAwake] = useState(false);
  const [touring, setTouring] = useState(false);
  const [live, setLive] = useState("");
  const awakeUntil = useRef(0);
  const touringRef = useRef(false);
  const cancelTour = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(0);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    if (!armed) return;
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setLive(t.voiceUnsupported);
      return;
    }
    let stopped = false;
    const rec = new Ctor();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (event) => {
      setLive(transcriptOf(event));
      if (touringRef.current) return;
      const chunk = transcriptOf(event, event.resultIndex ?? 0, true);
      if (!chunk) return;
      const parsed = extractAfterWake(chunk);
      const now = Date.now();
      if (parsed.woke && parsed.command) {
        setAwake(true);
        awakeUntil.current = 0;
        void submitUtterance(parsed.command, { speak: true });
        window.setTimeout(() => setAwake(false), 900);
        return;
      }
      if (parsed.woke) {
        setAwake(true);
        awakeUntil.current = now + 6500;
        return;
      }
      if (awakeUntil.current > now) {
        awakeUntil.current = 0;
        setAwake(false);
        void submitUtterance(chunk, { speak: true });
      }
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed") setLive(t.voiceUnsupported);
    };
    rec.onend = () => {
      if (stopped) return;
      window.setTimeout(() => {
        if (stopped) return;
        try {
          rec.start();
        } catch {
          /* restart after the browser ends a phrase */
        }
      }, 250);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setLive(t.voiceUnsupported);
    }
    return () => {
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [armed, lang, t.voiceUnsupported]);

  useEffect(() => {
    if (!armed) return;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let raf = 0;
    let closed = false;
    void navigator.mediaDevices?.getUserMedia({ audio: true }).then((mic) => {
      if (closed) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = mic;
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
      const source = audio.createMediaStreamSource(mic);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const bins = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(bins);
        let sum = 0;
        for (const value of bins) {
          const n = (value - 128) / 128;
          sum += n * n;
        }
        levelRef.current = Math.min(1, Math.sqrt(sum / bins.length) * 4.2);
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {
      levelRef.current = 0;
    });
    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
    };
  }, [armed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      const level = levelRef.current;
      const bars = 72;
      const gap = 3;
      const barW = Math.max(2, (width - gap * bars) / bars);
      for (let i = 0; i < bars; i++) {
        const idle = 0.18 + Math.sin(time / 420 + i * 0.35) * 0.12 + Math.sin(time / 180 + i) * 0.05;
        const voice = level * (0.45 + Math.sin(time / 90 + i * 0.8) * 0.35);
        const amp = Math.min(1, idle * 0.35 + voice);
        const h = Math.max(3, amp * (height - 8));
        ctx.fillStyle = i % 9 === 0 ? "rgba(94, 231, 255, 0.35)" : "rgba(214, 178, 106, 0.72)";
        ctx.fillRect(i * (barW + gap), (height - h) / 2, barW, h);
      }
      if (orbRef.current) {
        const scale = 1 + Math.sin(time / 700) * 0.04 + level * 0.55;
        orbRef.current.style.transform = `scale(${scale.toFixed(3)})`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function runTour() {
    if (touringRef.current) {
      cancelTour.current = true;
      touringRef.current = false;
      setTouring(false);
      stopSpeaking();
      return;
    }
    cancelTour.current = false;
    touringRef.current = true;
    setTouring(true);
    const speechLang = lang === "he" ? "he-IL" : "en-US";
    const intro = lang === "he" ? "סיור קולי. אני מפרק את הבקבוק חלק אחרי חלק." : "Voice tour. I will open the bottle one part at a time.";
    await speakWait(intro, speechLang);
    for (const step of TOUR) {
      if (cancelTour.current) break;
      useLab.getState().setExplode(step.explode);
      if (step.part) useLab.getState().select(step.part);
      await speakWait(lang === "he" ? step.he : step.en, speechLang);
    }
    touringRef.current = false;
    setTouring(false);
  }

  return (
    <div className="hands-free" data-variant="2">
      <canvas ref={canvasRef} className="voice-wave" aria-hidden="true" />
      <div className="orb-stack">
        <div ref={orbRef} className={awake || touring || armed ? "orb is-live" : "orb"} />
        <p className="live-caption" dir={lang === "he" ? "rtl" : "ltr"}>{live || (touring ? t.tourRunning : t.wakeHint)}</p>
        <div className="orb-actions">
          <button type="button" className={armed ? "text-btn is-on" : "text-btn"} onClick={() => setArmed((value) => !value)}>
            {armed ? t.listeningOn : t.armListen}
          </button>
          <button type="button" className={touring ? "text-btn spec-export" : "text-btn"} onClick={() => void runTour()}>
            {touring ? t.tourStop : t.tour}
          </button>
        </div>
      </div>
    </div>
  );
}

function speakWait(text: string, lang: "he-IL" | "en-US"): Promise<void> {
  return new Promise((resolve) => {
    const utterance = speak(text, lang);
    const timer = window.setTimeout(resolve, Math.min(7200, 1400 + text.length * 48));
    if (!utterance) return;
    utterance.onend = () => {
      window.clearTimeout(timer);
      resolve();
    };
    utterance.onerror = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
}
