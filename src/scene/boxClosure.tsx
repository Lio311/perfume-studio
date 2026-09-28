import { useCallback, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { closureById } from "../model/closures/registry.ts";
import { channelValue, closureDims, groupAmount, type ClosureLayoutInput } from "../model/closures/types.ts";
import type { BoxForm } from "../model/types.ts";
import type { Fit } from "../model/fit.ts";
import { useLab } from "../store/labStore.ts";
import { ClipSync, OuterSkin } from "./closures/kit.tsx";
import { builderFor } from "./closures/registry.ts";
import type { GroupBind } from "./closures/types.ts";

export function ClosureBox({ form, fit }: { form: BoxForm; fit: Fit }) {
  const structure = useLab((s) => s.design.box.structure ?? "lift-off");
  const latch = useLab((s) => s.design.box.latch ?? "none");
  const liftOff = useLab((s) => s.design.box.liftOff);
  const drawerPull = useLab((s) => s.design.box.drawerPull ?? "none");
  const ribbonOn = useLab((s) => s.design.box.ribbon === true);
  const pull = useLab((s) => s.design.box.pullTab === true);
  const stage = useLab((s) => s.stage);
  const open = useLab((s) => s.boxOpen);
  const spec = closureById(structure) ?? closureById("lift-off");
  const layout: ClosureLayoutInput = {
    variant: liftOff?.variant,
    neckMm: liftOff?.neckMm,
    lidDepthMm: liftOff?.lidDepthMm,
  };
  const Builder = (spec && builderFor(spec.id)) || builderFor("lift-off");
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const amount = useRef(0);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const specRef = useRef(spec);
  specRef.current = spec;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const bind = useCallback<GroupBind>((id) => (node) => {
    groups.current[id] = node;
    if (node) node.userData.hinge = id;
  }, []);

  const applyPose = (poseAmount: number) => {
    const current = specRef.current;
    if (!current) return;
    const live = fitRef.current;
    const dims = closureDims({ w: live.boxW, h: live.boxH, d: live.boxD, boardMm: live.boardMm }, current, layoutRef.current);
    for (const part of current.parts) {
      const node = groups.current[part.id];
      if (!node) continue;
      const local = groupAmount(part.motion, poseAmount);
      for (const channel of part.channels) {
        const value = channelValue(channel, dims, local);
        if (channel.kind === "rotate") node.rotation[channel.axis] = value;
        else node.position[channel.axis] = value;
      }
    }
  };

  useLayoutEffect(() => {
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = live;
    applyPose(live);
  }, [stage, open, structure, liftOff?.variant, liftOff?.neckMm, liftOff?.lidDepthMm, fit.boxW, fit.boxH, fit.boxD, fit.boardMm]);

  useFrame((_, dt) => {
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = THREE.MathUtils.damp(amount.current, live, 5.5, dt);
    applyPose(amount.current);
  });

  if (!spec || !Builder) return null;
  const dims = closureDims({ w: fit.boxW, h: fit.boxH, d: fit.boxD, boardMm: fit.boardMm }, spec, layout);
  return (
    <group>
      <ClipSync />
      <Builder form={form} fit={fit} spec={spec} dims={dims} bind={bind} ribbon={ribbonOn} pullTab={pull} latch={latch} drawerPull={drawerPull} />
      <OuterSkin w={dims.w} h={dims.h} d={dims.d} amount={amount} />
    </group>
  );
}
