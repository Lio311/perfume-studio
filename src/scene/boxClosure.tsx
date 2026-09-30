import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { renderedShape, sleeveOverActive, trayLiftMm } from "../model/boxFields.ts";
import { closureById } from "../model/closures/registry.ts";
import { channelValue, closureDims, groupAmount, type ClosureDims, type ClosureLayoutInput, type ClosureSpec } from "../model/closures/types.ts";
import { prefersReducedMotion } from "./motion.ts";
import type { BoxForm } from "../model/types.ts";
import type { Fit } from "../model/fit.ts";
import { useLab } from "../store/labStore.ts";
import { ClipSync, OuterSkin } from "./closures/kit.tsx";
import { builderFor } from "./closures/registry.ts";
import type { GroupBind } from "./closures/types.ts";
import { drawerInsertSeatOffset, drawerTrayFront } from "./closures/build/drawer.tsx";
import { liftOpeningRim } from "../model/closures/lift-off.ts";
import { tubeBaseHeight } from "../model/closures/tube.ts";
import { insertSeatNow, revealRiseMm, trayLiftNow } from "./trayLift.ts";
import { getUnboxPlayback } from "./unbox/playback.ts";
import { applyRibbonSlip } from "./unbox/ribbonSlip.ts";

export function ClosureBox({ form, fit }: { form: BoxForm; fit: Fit }) {
  const structure = useLab((s) => s.design.box.structure ?? "lift-off");
  const latch = useLab((s) => s.design.box.latch ?? "none");
  const liftOff = useLab((s) => s.design.box.liftOff);
  const drawerPull = useLab((s) => s.design.box.drawerPull ?? "none");
  const shape = useLab((s) => s.design.box.shape ?? { type: "rect" as const });
  const layers = useLab((s) => s.design.box.layers);
  const insertMotion = useLab((s) => s.design.box.insertMotion);
  const ribbonOn = useLab((s) => s.design.box.ribbon === true);
  const pull = useLab((s) => s.design.box.pullTab === true);
  const stage = useLab((s) => s.stage);
  const open = useLab((s) => s.boxOpen);
  const spec = closureById(structure) ?? closureById("lift-off");
  const drawn = renderedShape(shape, structure);
  const sleeveOn = sleeveOverActive(layers ?? []);
  const sleeveSpec = sleeveOn ? closureById("sleeve") : undefined;
  const sleeveWindow = sleeveOn ? (layers ?? []).find((layer) => layer.structure === "sleeve")?.window ?? null : null;
  const layout: ClosureLayoutInput = {
    variant: liftOff?.variant,
    neckMm: liftOff?.neckMm,
    lidDepthMm: liftOff?.lidDepthMm,
  };
  const Builder = (spec && builderFor(spec.id)) || builderFor("lift-off");
  const SleeveBuilder = sleeveSpec ? builderFor("sleeve") : undefined;
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const sleeveGroups = useRef<Record<string, THREE.Group | null>>({});
  const amount = useRef(0);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const specRef = useRef(spec);
  specRef.current = spec;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const sleeveRef = useRef(sleeveSpec);
  sleeveRef.current = sleeveSpec;
  const motionRef = useRef(insertMotion);
  motionRef.current = insertMotion;
  const pullRef = useRef(pull || ribbonOn || insertMotion?.pullTab === true);
  pullRef.current = pull || ribbonOn || insertMotion?.pullTab === true;
  const dimMemo = useRef<{ id: string; w: number; h: number; d: number; board: number; variant?: string; neck?: number; lid?: number; value: ClosureDims } | null>(null);
  const outerMemo = useRef<{ w: number; h: number; d: number; board: number; value: ClosureDims } | null>(null);
  const reducedMotion = useRef(prefersReducedMotion());

  const bind = useCallback<GroupBind>((id) => (node) => {
    groups.current[id] = node;
    if (node) node.userData.hinge = id;
  }, []);
  const bindSleeve = useCallback<GroupBind>((id) => (node) => {
    sleeveGroups.current[id] = node;
    if (node) node.userData.hinge = `outer-${id}`;
  }, []);

  const writeChannels = (current: ClosureSpec, nodes: Record<string, THREE.Group | null>, dims: ReturnType<typeof closureDims>, poseAmount: number) => {
    for (const part of current.parts) {
      const node = nodes[part.id];
      if (!node) continue;
      const local = groupAmount(part.motion, poseAmount);
      for (const channel of part.channels) {
        const value = channelValue(channel, dims, local);
        if (channel.kind === "rotate") node.rotation[channel.axis] = value;
        else if (channel.kind === "translate") node.position[channel.axis] = value;
      }
    }
  };

  const applyPose = (poseAmount: number) => {
    const current = specRef.current;
    const live = fitRef.current;
    let wall = live.boardMm;
    let dims: ClosureDims | null = null;
    if (current) {
      const layout = layoutRef.current;
      const prev = dimMemo.current;
      dims = prev
        && prev.id === current.id
        && prev.w === live.boxW
        && prev.h === live.boxH
        && prev.d === live.boxD
        && prev.board === live.boardMm
        && prev.variant === layout.variant
        && prev.neck === layout.neckMm
        && prev.lid === layout.lidDepthMm
        ? prev.value
        : closureDims({ w: live.boxW, h: live.boxH, d: live.boxD, boardMm: live.boardMm }, current, layout);
      if (!prev || dims !== prev.value) {
        dimMemo.current = {
          id: current.id,
          w: live.boxW,
          h: live.boxH,
          d: live.boxD,
          board: live.boardMm,
          variant: layout.variant,
          neck: layout.neckMm,
          lid: layout.lidDepthMm,
          value: dims,
        };
      }
      wall = dims.wall;
      writeChannels(current, groups.current, dims, poseAmount);
    }
    const outer = sleeveRef.current;
    if (outer) {
      const prev = outerMemo.current;
      const w = live.boxW + 10;
      const h = live.boxH + 8;
      const d = live.boxD + 10;
      const dims = prev && prev.w === w && prev.h === h && prev.d === d && prev.board === live.boardMm
        ? prev.value
        : closureDims({ w, h, d, boardMm: live.boardMm }, outer);
      if (!prev || dims !== prev.value) outerMemo.current = { w, h, d, board: live.boardMm, value: dims };
      writeChannels(outer, sleeveGroups.current, dims, poseAmount);
    }
    const motion = motionRef.current;
    const specLift = motion ? trayLiftMm(current?.id ?? "lift-off", motion, poseAmount, pullRef.current) : 0;
    let rim = 0;
    let riseStart = 0.42;
    if (dims && current) {
      if (current.id === "drawer") {
        const front = drawerTrayFront(dims.h, dims.wall);
        rim = front.y + front.trayH;
        riseStart = 0.7;
      } else if (current.id === "tube") {
        rim = tubeBaseHeight(dims);
        riseStart = 0.48;
      } else if (current.id === "lift-off") rim = liftOpeningRim(dims);
      else rim = dims.baseH;
    }
    trayLiftNow.mm = Math.max(specLift, revealRiseMm(rim, live.bottleH, poseAmount, riseStart, live.seatY));
    applyRibbonSlip(poseAmount);
    const tray = current?.id === "drawer" ? groups.current.tray : null;
    if (tray) {
      insertSeatNow.x = tray.position.x;
      insertSeatNow.y = tray.position.y + drawerInsertSeatOffset(wall, live.boardMm);
      insertSeatNow.z = tray.position.z;
      insertSeatNow.active = true;
    } else {
      insertSeatNow.x = 0;
      insertSeatNow.y = 0;
      insertSeatNow.z = 0;
      insertSeatNow.active = false;
    }
  };

  useLayoutEffect(() => {
    const playback = getUnboxPlayback();
    if (playback.phase === "playing") {
      amount.current = playback.openAmount;
      applyPose(playback.openAmount);
      return;
    }
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = live;
    applyPose(live);
  }, [stage, open, structure, sleeveOn, liftOff?.variant, liftOff?.neckMm, liftOff?.lidDepthMm, insertMotion?.trayLift.height, insertMotion?.trayLift.trigger, fit.boxW, fit.boxH, fit.boxD, fit.boardMm]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotion.current = query.matches;
    };
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => () => {
    trayLiftNow.mm = 0;
    insertSeatNow.x = 0;
    insertSeatNow.y = 0;
    insertSeatNow.z = 0;
    insertSeatNow.active = false;
  }, []);

  useFrame((_, dt) => {
    const playback = getUnboxPlayback();
    if (playback.phase === "playing") {
      amount.current = playback.openAmount;
      applyPose(amount.current);
      return;
    }
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = reducedMotion.current ? live : THREE.MathUtils.damp(amount.current, live, 5.5, dt);
    applyPose(amount.current);
  });

  if (!spec || !Builder) return null;
  const dims = closureDims({ w: fit.boxW, h: fit.boxH, d: fit.boxD, boardMm: fit.boardMm }, spec, layout);
  const outerDims = sleeveSpec ? closureDims({ w: fit.boxW + 10, h: fit.boxH + 8, d: fit.boxD + 10, boardMm: fit.boardMm }, sleeveSpec) : dims;
  return (
    <group>
      <ClipSync />
      <Builder form={form} fit={fit} spec={spec} dims={dims} bind={bind} ribbon={ribbonOn} pullTab={pull} latch={latch} drawerPull={drawerPull} shape={drawn} />
      {SleeveBuilder && sleeveSpec && (
        <SleeveBuilder form={form} fit={fit} spec={sleeveSpec} dims={outerDims} bind={bindSleeve} ribbon={false} pullTab={false} latch="none" drawerPull="none" shape={drawn} shellOnly window={sleeveWindow} />
      )}
      <OuterSkin w={outerDims.w} h={outerDims.h} d={outerDims.d} amount={amount} shape={drawn} />
    </group>
  );
}
