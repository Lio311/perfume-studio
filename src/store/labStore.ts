import { create } from "zustand";
import { persist } from "zustand/middleware";
import { commitSavedDesigns } from "./saveResult.ts";
import { produce } from "immer";
import { applyLook, applyVariant, createDefaultDesign, estimateMl, LOOKS } from "../model/design.ts";
import { BOTTLES } from "../model/bottles.ts";
import { CAPS } from "../model/caps.ts";
import { LOGOS } from "../model/logos.ts";
import { BOXES, COLLARS, PUMPS } from "../model/hardware.ts";
import { cycleId } from "../model/catalog.ts";
import { LIQUID_PALETTE, finishById } from "../model/materials.ts";
import type { Design, FinishId, NeckId, PartKey, VariantPart } from "../model/types.ts";
import { type ThemeId, applyTheme } from "../theme/themes.ts";
import type { Lang } from "../model/types.ts";
import type { LabCommand } from "../parser/interpret.ts";
import { parseVoiceParam, readVoiceParam, type VoiceVariant } from "../audio/wake.ts";
import { deletePack, savePack } from "../import/supplierDb.ts";
import { syncRegistry, type SupplierPack } from "../import/registry.ts";
import { apiClient } from "../api/client.ts";

export type LabMode = "assemble" | "explode" | "dimensions" | "compare";
export type ViewPreset = "home" | "front" | "three" | "top" | "side";
export type StageMode = "bottle" | "box" | "together";

export interface ChatMessage {
  id: string;
  role: "user" | "lab";
  text?: string;
  he?: string;
  en?: string;
  /** Design captured before this chat action, so the reply can undo itself. */
  snapshot?: Design;
}

export interface SavedDesign {
  id: string;
  name: string;
  design: Design;
  thumb: string;
  createdAt: number;
}

export interface PendingFile {
  name: string;
  type: string;
  size: number;
  thumb?: string;
}

export interface PendingPart {
  id: string;
  name: string;
  category: VariantPart | "unassigned";
  files: PendingFile[];
  createdAt: number;
}

interface LabState {
  design: Design;
  selected: PartKey | null;
  hovered: { part: PartKey; x: number; y: number } | null;
  mode: LabMode;
  explode: number;
  viewPreset: ViewPreset;
  past: Design[];
  future: Design[];
  gesturing: boolean;
  autoRotate: boolean;
  viewToken: number;
  focusToken: number;
  theme: ThemeId;
  lang: Lang;
  libraryOpen: boolean;
  sideOpen: boolean;
  modal: "save" | "compare" | "upload" | "supplier" | "photo" | null;
  units: "mm" | "cm" | "in";
  suppliers: SupplierPack[];
  chat: ChatMessage[];
  saved: SavedDesign[];
  pending: PendingPart[];
  compareIds: string[];
  voice: VoiceVariant;
  soundOn: boolean;
  stage: StageMode;
  blueprint: boolean;
  fullToken: number;
  aimed: boolean;
  solo: PartKey | null;
  present: boolean;
  exporting: boolean;
  palette: boolean;
  help: boolean;
  boxOpen: boolean;
  select: (part: PartKey | null) => void;
  hover: (part: PartKey | null, x?: number, y?: number) => void;
  patch: (part: PartKey, partial: Record<string, unknown>) => void;
  applyCommands: (commands: LabCommand[], options?: { quiet?: boolean }) => void;
  toast: string;
  cycle: (dir: number, part?: VariantPart) => void;
  randomize: () => void;
  setMode: (mode: LabMode) => void;
  setExplode: (amount: number) => void;
  setView: (preset: ViewPreset) => void;
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  restoreDesign: (design: Design) => void;
  duplicateDesign: () => void;
  toggleRotate: () => void;
  resetView: () => void;
  setTheme: (theme: ThemeId) => void;
  setLang: (lang: Lang) => void;
  setLibraryOpen: (open: boolean) => void;
  setSideOpen: (open: boolean) => void;
  setModal: (modal: LabState["modal"]) => void;
  pushChat: (message: ChatMessage) => void;
  saveDesign: (name: string, thumb: string) => { ok: boolean };
  loadDesign: (id: string) => void;
  newDesign: () => void;
  deleteDesign: (id: string) => void;
  toggleCompare: (id: string) => void;
  addPending: (part: PendingPart) => void;
  removePending: (id: string) => void;
  setSuppliers: (packs: SupplierPack[]) => void;
  upsertSupplier: (pack: SupplierPack) => void;
  removeSupplier: (id: string) => void;
  setVoice: (voice: VoiceVariant) => void;
  setSoundOn: (on: boolean) => void;
  setStage: (stage: StageMode) => void;
  setBlueprint: (on: boolean) => void;
  showFull: () => void;
  isolate: (part: PartKey) => void;
  exitSolo: () => void;
  setPresent: (on: boolean) => void;
  setPalette: (on: boolean) => void;
  setHelp: (on: boolean) => void;
  setBoxOpen: (open: boolean) => void;
  setUnits: (unit: "mm" | "cm" | "in") => void;
  applyVoiceParam: (value: string | null) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function makeSeed(design: Design) {
  design.step = 7;
  design.bottle.visible = true;
  design.cap.visible = true;
  design.label.visible = true;
  design.pump.visible = true;
  design.collar.visible = true;
  design.box.visible = true;
  design.liquid.visible = true;
  return design;
}

function seeds(): SavedDesign[] {
  const atelier = makeSeed(createDefaultDesign());
  const blush = makeSeed(createDefaultDesign());
  applyVariant(blush, "bottle", "flacon-50");
  applyVariant(blush, "cap", "cap-dome-28");
  applyLook(blush, LOOKS[1]);
  const noir = makeSeed(createDefaultDesign());
  applyVariant(noir, "bottle", "diamond-50");
  applyVariant(noir, "cap", "cap-crystal");
  applyVariant(noir, "box", "box-magnetic");
  applyLook(noir, LOOKS[2]);
  return [
    { id: "seed-atelier", name: "ATELIER NOIR", design: atelier, thumb: "", createdAt: 1 },
    { id: "seed-blush", name: "פלקון · סומק", design: blush, thumb: "", createdAt: 2 },
    { id: "seed-noir", name: "יהלום · נואר", design: noir, thumb: "", createdAt: 3 },
  ];
}

function applyOne(design: Design, command: LabCommand, ui: { explode: number; mode: LabMode; autoRotate: boolean; viewToken: number; selected: PartKey | null; focusToken: number }) {
  switch (command.type) {
    case "finish": {
      const finish = command.finish;
      const color = finishById(finish).color;
      if (command.part === "bottle") Object.assign(design.bottle, { finish, color });
      if (command.part === "cap") Object.assign(design.cap, { finish, color });
      if (command.part === "label") Object.assign(design.label, { finish, color });
      if (command.part === "pump") Object.assign(design.pump, { finish, color });
      if (command.part === "collar") Object.assign(design.collar, { finish, color });
      if (command.part === "box") Object.assign(design.box, { finish, color });
      break;
    }
    case "color":
      if (command.part === "liquid") {
        design.liquid.color = command.color;
      } else {
        Object.assign(design[command.part], { color: command.color });
        if (command.part === "bottle" && design.bottle.finish === "clear") {
          design.bottle.finish = "tinted";
        }
      }
      break;
    case "variant":
      applyVariant(design, command.part, command.id);
      if (command.part !== 'box' || design.box) {
         (design[command.part] as any).visible = true;
      }
      break;
    case "cycle": {
      const current =
        command.part === "bottle" ? design.bottle.variantId :
        command.part === "cap" ? design.cap.variantId :
        command.part === "label" ? design.label.variantId :
        command.part === "pump" ? design.pump.variantId :
        command.part === "collar" ? design.collar.variantId :
        design.box.variantId;
      applyVariant(design, command.part, cycleId(command.part, current, command.dir));
      break;
    }
    case "nudge": {
      const delta = command.delta;
      if (command.part === "bottle") {
        if (command.axis !== "width") design.bottle.heightMm = clamp(design.bottle.heightMm + delta, 48, 180);
        if (command.axis !== "height") design.bottle.widthMm = clamp(design.bottle.widthMm + delta * 0.6, 26, 96);
        design.bottle.depthMm = clamp(design.bottle.depthMm + (command.axis === "height" ? 0 : delta * 0.5), 20, 90);
      } else if (command.part === "cap") {
        if (command.axis !== "width") design.cap.heightMm = clamp(design.cap.heightMm + delta, 10, 78);
        if (command.axis !== "height") design.cap.widthMm = clamp(design.cap.widthMm + delta * 0.45, 16, 48);
      } else if (command.part === "box") {
        design.box.linked = false;
        if (command.axis !== "width") design.box.heightMm = clamp(design.box.heightMm + delta, 70, 240);
        if (command.axis !== "height") design.box.widthMm = clamp(design.box.widthMm + delta, 40, 160);
      } else if (command.part === "label") {
        design.label.scale = clamp(design.label.scale + delta * 0.03, 0.55, 1.6);
      }
      break;
    }
    case "size":
      if (command.part === "bottle") {
        if (command.axis === "height") design.bottle.heightMm = clamp(command.mm, 48, 180);
        if (command.axis === "width") design.bottle.widthMm = clamp(command.mm, 26, 96);
        if (command.axis === "depth") design.bottle.depthMm = clamp(command.mm, 20, 90);
      } else if (command.part === "cap") {
        if (command.axis === "height") design.cap.heightMm = clamp(command.mm, 10, 78);
        if (command.axis === "width") design.cap.widthMm = clamp(command.mm, 16, 48);
      } else if (command.part === "box") {
        design.box.linked = false;
        if (command.axis === "height") design.box.heightMm = clamp(command.mm, 70, 240);
        if (command.axis === "width") design.box.widthMm = clamp(command.mm, 40, 160);
        if (command.axis === "depth") design.box.depthMm = clamp(command.mm, 30, 140);
      }
      break;
    case "visible":
      design[command.part].visible = command.visible;
      break;
    case "neck":
      design.bottle.neck = command.neck;
      break;
    case "fill":
      design.liquid.fill = clamp(command.value, 0.05, 0.95);
      break;
    case "text":
      design.label.text = command.text.slice(0, 32);
      break;
    case "explode":
      ui.explode = command.value ? 1 : 0;
      ui.mode = command.value ? "explode" : ui.mode === "explode" ? "assemble" : ui.mode;
      break;
    case "rotate":
      ui.autoRotate = command.value === "toggle" ? !ui.autoRotate : command.value === "on";
      break;
    case "reset":
      ui.viewToken += 1;
      break;
    case "random": {
      applyVariant(design, "bottle", BOTTLES[Math.floor(Math.random() * BOTTLES.length)].id);
      applyVariant(design, "cap", CAPS[Math.floor(Math.random() * CAPS.length)].id);
      applyVariant(design, "label", LOGOS[Math.floor(Math.random() * LOGOS.length)].id);
      applyVariant(design, "pump", PUMPS[Math.floor(Math.random() * PUMPS.length)].id);
      applyVariant(design, "collar", COLLARS[Math.floor(Math.random() * COLLARS.length)].id);
      applyVariant(design, "box", BOXES[Math.floor(Math.random() * BOXES.length)].id);
      applyLook(design, LOOKS[Math.floor(Math.random() * LOOKS.length)]);
      break;
    }
    case "select":
      ui.selected = command.part;
      ui.focusToken += 1;
      break;
    case "help":
      break;
    case "wizard_step":
      design.step = command.step;
      break;
    default:
      break;
  }
}

let explodeRaf = 0;

function cancelExplodeTween() {
  if (explodeRaf) cancelAnimationFrame(explodeRaf);
  explodeRaf = 0;
}

function writeExplode(amount: number, holdAssemble: boolean) {
  useLab.setState((state) => {
    const explode = clamp(amount, 0, 1);
    const mode: LabMode =
      holdAssemble && state.mode === "assemble"
        ? "assemble"
        : state.mode === "compare" || state.mode === "dimensions"
          ? state.mode
          : explode < 0.02
            ? "assemble"
            : "explode";
    return { explode, mode };
  });
}

function tweenExplode(to: number, ms: number) {
  cancelExplodeTween();
  const from = useLab.getState().explode;
  const holdAssemble = useLab.getState().mode === "assemble";
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    writeExplode(from + (to - from) * eased, holdAssemble);
    if (t < 1) explodeRaf = requestAnimationFrame(step);
    else explodeRaf = 0;
  };
  explodeRaf = requestAnimationFrame(step);
}

export const useLab = create<LabState>()(
  persist(
    (set, get) => ({
      design: createDefaultDesign(),
      selected: null,
      hovered: null,
      mode: "assemble",
      explode: 0,
      toast: "",
      exporting: false,
      viewPreset: "home",
      past: [],
      future: [],
      gesturing: false,
      autoRotate: false,
      viewToken: 0,
      focusToken: 0,
      stage: "bottle",
      blueprint: false,
      fullToken: 0,
      aimed: false,
      solo: null,
      present: false,
      palette: false,
      help: false,
      boxOpen: false,
      theme: "dark",
      lang: "he",
      libraryOpen: false,
      sideOpen: false,
      modal: null,
      units: "mm",
      chat: [],
      saved: seeds(),
      pending: [],
      suppliers: [],
      compareIds: ["seed-atelier", "seed-blush", "seed-noir"],
      voice: readVoiceParam(),
      soundOn: true,
      select: (part) => set((state) => ({ selected: part, aimed: Boolean(part), focusToken: part ? state.focusToken + 1 : state.focusToken, sideOpen: part ? true : state.sideOpen })),
      hover: (part, x = 0, y = 0) => set({ hovered: part ? { part, x, y } : null }),
      patch: (part, partial) =>
        set((state) => {
          const next = produce(state.design, (draft) => {
            const target = draft[part] as unknown as Record<string, unknown>;
            Object.assign(target, partial);
            if (part === "box" && ("heightMm" in partial || "widthMm" in partial || "depthMm" in partial) && !("linked" in partial)) {
              draft.box.linked = false;
            }
          });
          return state.gesturing ? { design: next } : { design: next, past: [...state.past, state.design].slice(-30), future: [] };
        }),
      applyCommands: (commands, options) =>
        set((state) => {
          const ui = {
            explode: state.explode,
            mode: state.mode,
            autoRotate: state.autoRotate,
            viewToken: state.viewToken,
            selected: state.selected,
            focusToken: state.focusToken,
          };
          
          const design = produce(state.design, (draft) => {
            for (const command of commands) applyOne(draft, command, ui);
          });
          
          const quiet = options?.quiet;
          const designChanged = design !== state.design;
          
          return {
            design,
            explode: ui.explode,
            mode: ui.mode,
            autoRotate: ui.autoRotate,
            viewToken: ui.viewToken,
            selected: ui.selected,
            focusToken: quiet ? state.focusToken : ui.focusToken,
            sideOpen: ui.selected ? true : state.sideOpen,
            aimed: quiet ? state.aimed : ui.focusToken !== state.focusToken ? true : state.aimed,
            past: designChanged ? [...state.past, state.design].slice(-30) : state.past,
            future: designChanged ? [] : state.future,
          };
        }),
      cycle: (dir, part) => {
        const selected = part ?? get().selected;
        if (selected === "liquid") {
          const colors = LIQUID_PALETTE;
          const current = get().design.liquid.color.toLowerCase();
          const index = Math.max(0, colors.findIndex((c) => c.toLowerCase() === current));
          const next = colors[(index + dir + colors.length) % colors.length];
          get().patch("liquid", { color: next });
          return;
        }
        const kind: VariantPart = selected ?? "bottle";
        get().applyCommands([{ type: "cycle", part: kind, dir: dir > 0 ? 1 : -1 }, { type: "select", part: kind }]);
      },
      randomize: () => get().applyCommands([{ type: "random" }]),
      setMode: (mode) => {
        if (mode === "assemble") {
          set({ mode: "assemble" });
          tweenExplode(0, 450);
          return;
        }
        if (mode === "explode") {
          set({ mode: "explode" });
          const current = get().explode;
          tweenExplode(current < 0.5 ? 0.6 : Math.max(current, 0.6), 650);
          return;
        }
        set({ mode });
      },
      setExplode: (amount) => {
        cancelExplodeTween();
        writeExplode(clamp(amount, 0, 1), false);
      },
      setView: (viewPreset) => set((state) => ({ viewPreset, viewToken: state.viewToken + 1 })),
      undo: () =>
        set((state) => {
          const previous = state.past[state.past.length - 1];
          const note = state.lang === "he" ? "בוטל" : "Undone";
          if (!previous) return { toast: state.lang === "he" ? "אין מה לבטל" : "Nothing to undo" };
          return { design: previous, past: state.past.slice(0, -1), future: [state.design, ...state.future].slice(0, 30), toast: note };
        }),
      redo: () =>
        set((state) => {
          const next = state.future[0];
          const note = state.lang === "he" ? "חזר" : "Redone";
          if (!next) return { toast: state.lang === "he" ? "אין מה לחזור" : "Nothing to redo" };
          return { design: next, future: state.future.slice(1), past: [...state.past, state.design].slice(-30), toast: note };
        }),
      beginGesture: () =>
        set((state) => (state.gesturing ? state : { gesturing: true, past: [...state.past, state.design].slice(-30), future: [] })),
      endGesture: () => set({ gesturing: false }),
      restoreDesign: (design) =>
        set((state) => ({
          design: design,
          past: [...state.past, state.design].slice(-30),
          future: [],
        })),
      duplicateDesign: () =>
        set((state) => ({
          saved: [{ id: uid("cfg"), name: state.lang === "he" ? "עותק" : "Copy", design: state.design, thumb: "", createdAt: Date.now() }, ...state.saved].slice(0, 24),
        })),
      toggleRotate: () => set((state) => ({ autoRotate: !state.autoRotate })),
      resetView: () =>
        set((state) => ({
          viewPreset: "home",
          viewToken: state.viewToken + 1,
          selected: null,
          aimed: false,
          solo: null,
        })),
      setTheme: (theme) => { applyTheme(theme); set({ theme }); },
      setLang: (lang) => set({ lang }),
      setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
      setSideOpen: (sideOpen) => set({ sideOpen }),
      setModal: (modal) => set({ modal }),
      pushChat: (message) => set((state) => ({ chat: [...state.chat, message].slice(-40) })),
      saveDesign: (name, thumb) => {
        const previous = get().saved;
        const id = uid("cfg");
        const newDesign = { id, name: name.trim() || "סקיצה", design: get().design, thumb, createdAt: Date.now() };
        const next = [newDesign, ...previous].slice(0, 24);
        const result = commitSavedDesigns(previous, next, (saved) => {
          set({ saved });
        });
        if (!result.ok) return { ok: false };
        void apiClient.post("/designs", newDesign).catch((error) => {
          console.error("Failed to save design to backend", error);
        });
        return { ok: true };
      },
      newDesign: () => {
        set({ design: createDefaultDesign(), past: [], future: [], modal: null });
      },
      loadDesign: async (id) => {
        try {
          const loaded = await apiClient.get<SavedDesign>(`/designs/${id}`);
          if (loaded && loaded.design) {
            set((state) => ({ design: loaded.design, modal: null, focusToken: state.focusToken + 1 }));
            return;
          }
        } catch (e) {
          console.error("Failed to load design from backend", e);
        }
        const found = get().saved.find((item) => item.id === id);
        if (!found) return;
        set((state) => ({ design: found.design, modal: null, focusToken: state.focusToken + 1 }));
      },
      deleteDesign: async (id) => {
        set((state) => ({ saved: state.saved.filter((item) => item.id !== id), compareIds: state.compareIds.filter((item) => item !== id) }));
        try {
          await apiClient.delete(`/designs/${id}`);
        } catch (e) {
          console.error("Failed to delete design from backend", e);
        }
      },
      toggleCompare: (id) =>
        set((state) => {
          const has = state.compareIds.includes(id);
          const compareIds = has ? state.compareIds.filter((item) => item !== id) : [...state.compareIds, id].slice(-3);
          return { compareIds };
        }),
      addPending: (part) => set((state) => ({ pending: [part, ...state.pending].slice(0, 30), modal: null })),
      removePending: (id) => set((state) => ({ pending: state.pending.filter((item) => item.id !== id) })),
      setSuppliers: (packs) => {
        syncRegistry(packs);
        set({ suppliers: packs });
      },
      upsertSupplier: (pack) => {
        const suppliers = [pack, ...get().suppliers.filter((item) => item.id !== pack.id)];
        syncRegistry(suppliers);
        set({ suppliers, modal: null });
        void savePack(pack);
      },
      removeSupplier: (id) => {
        const suppliers = get().suppliers.filter((item) => item.id !== id);
        syncRegistry(suppliers);
        set({ suppliers });
        void deletePack(id);
      },
      setVoice: (voice) => {
        if (typeof location !== "undefined" && typeof history !== "undefined") {
          const url = new URL(location.href);
          url.searchParams.set("voice", String(voice));
          history.replaceState(history.state, "", url);
        }
        set({ voice });
      },
      setSoundOn: (soundOn) => set({ soundOn }),
      setStage: (stage) =>
        set((state) => ({
          stage,
          selected: stage === "box" ? "box" : null,
          aimed: false,
          solo: null,
          fullToken: state.fullToken + 1,
          design:
            stage === "bottle"
              ? state.design
              : { ...state.design, box: { ...state.design.box, visible: true } },
        })),
      setBlueprint: (blueprint) => set({ blueprint }),
      showFull: () => set((state) => ({ selected: null, aimed: false, solo: null, fullToken: state.fullToken + 1 })),
      isolate: (part) => set((state) => ({ solo: part, selected: part, aimed: true, sideOpen: true, focusToken: state.focusToken + 1 })),
      exitSolo: () => set((state) => ({ solo: null, selected: null, aimed: false, fullToken: state.fullToken + 1 })),
      setPresent: (present) => set({ present, autoRotate: present }),
      setUnits: (units) => set({ units }),
      setPalette: (palette) => set({ palette, help: false }),
      setHelp: (help) => set({ help, palette: false }),
      setBoxOpen: (boxOpen) => set({ boxOpen }),
      applyVoiceParam: (value: string | null) => set({ voice: parseVoiceParam(value) }),
    }),
    {
      name: "perfume-lab-v1",
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as { design?: Design; theme?: ThemeId };
        if (version < 2 && state.design?.cap.variantId === "cap-cyl-32" && state.design.label.text === "Nº 01") {
          state.design = createDefaultDesign();
        }
        if (version < 3) state.theme = "light";
        if (version < 4) state.theme = "dark";
        return state;
      },
      partialize: (state) => ({
        design: state.design,
        theme: state.theme,
        lang: state.lang,
        chat: state.chat,
        saved: state.saved,
        pending: state.pending,
        compareIds: state.compareIds,
      }),
    },
  ),
);

export function liveMl(): number {
  return estimateMl(useLab.getState().design);
}

export type { FinishId, NeckId };
