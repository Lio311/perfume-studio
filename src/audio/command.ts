import { interpretCommand } from "../parser/interpreter.ts";
import { useLab } from "../store/labStore.ts";
import { speak } from "./speech.ts";

export async function submitUtterance(utterance: string, options: { speak: boolean; hebrew?: boolean }): Promise<void> {
  const text = utterance.trim();
  if (!text) return;
  const { lang, design, selected, pushChat, applyCommands } = useLab.getState();
  const snapshot = structuredClone(design);
  pushChat({ id: `u-${Date.now()}`, role: "user", text });
  const result = await interpretCommand(text, {
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
  pushChat({ id: `l-${Date.now()}`, role: "lab", he: result.reply.he, en: result.reply.en, snapshot });
  if (!options.speak) return;
  const hebrew = options.hebrew || lang === "he";
  speak(hebrew ? result.reply.he : result.reply.en, hebrew ? "he-IL" : "en-US");
}
