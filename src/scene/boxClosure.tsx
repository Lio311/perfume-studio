import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { renderedShape, sleeveOverActive, trayLiftMm } from "../model/boxFields.ts";
import { closureById } from "../model/closures/registry.ts";
import { channelValue, closureDims, groupAmount, type ClosureLayoutInput, type ClosureSpec } from "../model/closures/types.ts";
import type { BoxForm } from "../model/types.ts";
import type { Fit } from "../model/fit.ts";
import { useLab } from "../store/labStore.ts";
import { ClipSync, OuterSkin } from "./closures/kit.tsx";
import { builderFor } from "./closures/registry.ts";
import type { GroupBind } from "./closures/types.ts";
import { insertSeatNow, trayLiftNow } from "./trayLift.ts";

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
    if (current) {
      const dims = closureDims({ w: live.boxW, h: live.boxH, d: live.boxD, boardMm: live.boardMm }, current, layoutRef.current);
      writeChannels(current, groups.current, dims, poseAmount);
    }
    const outer = sleeveRef.current;
    if (outer) {
      const dims = closureDims({ w: live.boxW + 10, h: live.boxH + 8, d: live.boxD + 10, boardMm: live.boardMm }, outer);
      writeChannels(outer, sleeveGroups.current, dims, poseAmount);
    }
    const motion = motionRef.current;
    trayLiftNow.mm = motion ? trayLiftMm(current?.id ?? "lift-off", motion, poseAmount, pullRef.current) : 0;
    const tray = current?.id === "drawer" ? groups.current.tray : null;
    if (tray) {
      insertSeatNow.x = tray.position.x;
      insertSeatNow.y = tray.position.y;
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
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = live;
    applyPose(live);
  }, [stage, open, structure, sleeveOn, liftOff?.variant, liftOff?.neckMm, liftOff?.lidDepthMm, insertMotion?.trayLift.height, insertMotion?.trayLift.trigger, fit.boxW, fit.boxH, fit.boxD, fit.boardMm]);

  useEffect(() => () => {
    trayLiftNow.mm = 0;
    insertSeatNow.x = 0;
    insertSeatNow.y = 0;
    insertSeatNow.z = 0;
    insertSeatNow.active = false;
  }, []);

  useFrame((_, dt) => {
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = THREE.MathUtils.damp(amount.current, live, 5.5, dt);
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
        <SleeveBuilder form={form} fit={fit} spec={sleeveSpec} dims={outerDims} bind={bindSleeve} ribbon={false} pullTab={false} latch="none" drawerPull="none" shape={{ type: "rect" }} shellOnly window={sleeveWindow} />
      )}
      <OuterSkin w={outerDims.w} h={outerDims.h} d={outerDims.d} amount={amount} />
      <pointLight position={[0, dims.h * 0.42, 0]} intensity={6} distance={Math.max(80, dims.h * 2.4)} decay={2} color="#fff6ea" />
      <pointLight position={[0, dims.h * 0.78, dims.d * 0.15]} intensity={3.2} distance={Math.max(70, dims.h * 2)} decay={2} color="#f3efe6" />
    </group>
  );
}
