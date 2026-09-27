import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyLook, applyVariant, createDefaultDesign, estimateMl, LOOKS } from "../model/design.ts";
import { BOTTLES } from "../model/bottles.ts";
import { CAPS } from "../model/caps.ts";
import { LOGOS } from "../model/logos.ts";
import { BOXES, COLLARS, PUMPS } from "../model/hardware.ts";
import { cycleId } from "../model/catalog.ts";
import { LIQUID_PALETTE, finishById } from "../model/materials.ts";
import type { Design, FinishId, NeckId, PartKey, VariantPart } from "../model/types.ts";
import type { ThemeId } from "../theme/themes.ts";
import type { Lang } from "../model/types.ts";
import type { LabCommand } from "../parser/interpret.ts";

export interface ChatMessage {
  id: string;
  role: "user" | "lab";
  text?: string;
  he?: string;
  en?: string;
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
  exploded: boolean;
  autoRotate: boolean;
  viewToken: number;
  focusToken: number;
  theme: ThemeId;
  lang: Lang;
  libraryOpen: boolean;
  sideOpen: boolean;
  modal: "save" | "compare" | "upload" | null;
  chat: ChatMessage[];
  saved: SavedDesign[];
  pending: PendingPart[];
  compareIds: string[];
  select: (part: PartKey | null) => void;
  hover: (part: PartKey | null, x?: number, y?: number) => void;
  patch: (part: PartKey, partial: Record<string, unknown>) => void;
  applyCommands: (commands: LabCommand[]) => void;
  cycle: (dir: number, part?: VariantPart) => void;
  randomize: () => void;
  toggleExplode: () => void;
  toggleRotate: () => void;
  resetView: () => void;
  setTheme: (theme: ThemeId) => void;
  setLang: (lang: Lang) => void;
  setLibraryOpen: (open: boolean) => void;
  setSideOpen: (open: boolean) => void;
  setModal: (modal: LabState["modal"]) => void;
  pushChat: (message: ChatMessage) => void;
  saveDesign: (name: string, thumb: string) => void;
  loadDesign: (id: string) => void;
  deleteDesign: (id: string) => void;
  toggleCompare: (id: string) => void;
  addPending: (part: PendingPart) => void;
  removePending: (id: string) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function seeds(): SavedDesign[] {
  const atelier = createDefaultDesign();
  const blush = createDefaultDesign();
  applyVariant(blush, "bottle", "flacon-50");
  applyVariant(blush, "cap", "cap-dome-28");
  applyLook(blush, LOOKS[1]);
  const noir = createDefaultDesign();
  applyVariant(noir, "bottle", "diamond-50");
  applyVariant(noir, "cap", "cap-crystal");
  applyVariant(noir, "box", "box-magnetic");
  applyLook(noir, LOOKS[2]);
  return [
    { id: "seed-atelier", name: "קארה · אטלייה", design: atelier, thumb: "", createdAt: 1 },
    { id: "seed-blush", name: "פלקון · סומק", design: blush, thumb: "", createdAt: 2 },
    { id: "seed-noir", name: "יהלום · נואר", design: noir, thumb: "", createdAt: 3 },
  ];
}

function applyOne(design: Design, command: LabCommand, ui: { exploded: boolean; autoRotate: boolean; viewToken: number; selected: PartKey | null; focusToken: number }) {
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
      if (command.part === "liquid") design.liquid.color = command.color;
      else Object.assign(design[command.part], { color: command.color });
      break;
    case "variant":
      applyVariant(design, command.part, command.id);
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
      ui.exploded = command.value;
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
    default:
      break;
  }
}

export const useLab = create<LabState>()(
  persist(
    (set, get) => ({
      design: createDefaultDesign(),
      selected: "bottle",
      hovered: null,
      exploded: false,
      autoRotate: false,
      viewToken: 0,
      focusToken: 0,
      theme: "dark",
      lang: "he",
      libraryOpen: false,
      sideOpen: false,
      modal: null,
      chat: [],
      saved: seeds(),
      pending: [],
      compareIds: ["seed-atelier", "seed-blush", "seed-noir"],
      select: (part) => set((state) => ({ selected: part, focusToken: part ? state.focusToken + 1 : state.focusToken, sideOpen: part ? true : state.sideOpen })),
      hover: (part, x = 0, y = 0) => set({ hovered: part ? { part, x, y } : null }),
      patch: (part, partial) =>
        set((state) => {
          const next = structuredClone(state.design);
          const target = next[part] as unknown as Record<string, unknown>;
          Object.assign(target, partial);
          if (part === "box" && ("heightMm" in partial || "widthMm" in partial || "depthMm" in partial) && !("linked" in partial)) {
            next.box.linked = false;
          }
          return { design: next };
        }),
      applyCommands: (commands) =>
        set((state) => {
          const design = structuredClone(state.design);
          const ui = {
            exploded: state.exploded,
            autoRotate: state.autoRotate,
            viewToken: state.viewToken,
            selected: state.selected,
            focusToken: state.focusToken,
          };
          for (const command of commands) applyOne(design, command, ui);
          return { design, ...ui, sideOpen: ui.selected ? true : state.sideOpen };
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
      toggleExplode: () => set((state) => ({ exploded: !state.exploded })),
      toggleRotate: () => set((state) => ({ autoRotate: !state.autoRotate })),
      resetView: () => set((state) => ({ viewToken: state.viewToken + 1 })),
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
      setSideOpen: (sideOpen) => set({ sideOpen }),
      setModal: (modal) => set({ modal }),
      pushChat: (message) => set((state) => ({ chat: [...state.chat, message].slice(-40) })),
      saveDesign: (name, thumb) =>
        set((state) => ({
          saved: [{ id: uid("cfg"), name: name.trim() || "סקיצה", design: structuredClone(state.design), thumb, createdAt: Date.now() }, ...state.saved].slice(0, 24),
          modal: null,
        })),
      loadDesign: (id) => {
        const found = get().saved.find((item) => item.id === id);
        if (!found) return;
        set((state) => ({ design: structuredClone(found.design), modal: null, focusToken: state.focusToken + 1 }));
      },
      deleteDesign: (id) => set((state) => ({ saved: state.saved.filter((item) => item.id !== id), compareIds: state.compareIds.filter((item) => item !== id) })),
      toggleCompare: (id) =>
        set((state) => {
          const has = state.compareIds.includes(id);
          const compareIds = has ? state.compareIds.filter((item) => item !== id) : [...state.compareIds, id].slice(-3);
          return { compareIds };
        }),
      addPending: (part) => set((state) => ({ pending: [part, ...state.pending].slice(0, 30), modal: null })),
      removePending: (id) => set((state) => ({ pending: state.pending.filter((item) => item.id !== id) })),
    }),
    {
      name: "perfume-lab-v1",
      version: 1,
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
