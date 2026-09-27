import { tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";
import type { VoiceVariant } from "../audio/wake.ts";

const ITEMS: VoiceVariant[] = [1, 2, 3];

export function VoiceSwitch() {
  const lang = useLab((s) => s.lang);
  const voice = useLab((s) => s.voice);
  const setVoice = useLab((s) => s.setVoice);
  const t = tx(lang);
  const label: Record<VoiceVariant, string> = { 1: t.voice1, 2: t.voice2, 3: t.voice3 };
  return (
    <div className="voice-switch" dir="ltr" role="tablist" aria-label={t.voiceVariants}>
      {ITEMS.map((item) => (
        <button key={item} type="button" role="tab" aria-selected={voice === item} className={voice === item ? "is-on" : ""} onClick={() => setVoice(item)}>
          {label[item]}
        </button>
      ))}
    </div>
  );
}
