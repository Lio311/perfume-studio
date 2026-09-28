import type { ReactElement } from "react";
import type * as THREE from "three";
import type { ClosureDims, ClosureSpec } from "../../model/closures/types.ts";
import type { Fit } from "../../model/fit.ts";
import type { BoxForm } from "../../model/types.ts";

export type GroupBind = (id: string) => (node: THREE.Group | null) => void;

export interface ClosureBuildProps {
  form: BoxForm;
  fit: Fit;
  spec: ClosureSpec;
  dims: ClosureDims;
  bind: GroupBind;
  ribbon: boolean;
  pullTab: boolean;
}

export type ClosureBuilder = (props: ClosureBuildProps) => ReactElement;
