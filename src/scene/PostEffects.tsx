import { Component, useRef, useState, type ReactNode } from "react";
// , useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useLab } from "../store/labStore.ts";
import { Bloom, EffectComposer, Scanline, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { SMAAPreset, ToneMappingMode } from "postprocessing";

class GradeBoundary extends Component<{ children: ReactNode; onFail: () => void }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError(): { dead: boolean } {
    return { dead: true };
  }
  componentDidCatch(): void {
    this.props.onFail();
  }
  render(): ReactNode {
    return this.state.dead ? null : this.props.children;
  }
}

function GradeWatch({ onFail }: { onFail: () => void }) {
  const voice = useLab((s) => s.voice);
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current || voice !== 3) return;
    frames.current += 1;
    if (frames.current < 28) return;
    done.current = true;
    const ctx = gl.getContext();
    const width = ctx.drawingBufferWidth;
    const height = ctx.drawingBufferHeight;
    if (width < 2 || height < 2) return;
    const pixel = new Uint8Array(4);
    let brightest = 0;
    const samples: Array<[number, number]> = [
      [0.5, 0.58],
      [0.5, 0.46],
      [0.44, 0.52],
      [0.6, 0.52],
      [0.5, 0.7],
      [0.36, 0.4],
    ];
    try {
      for (const [fx, fy] of samples) {
        ctx.readPixels(Math.floor(width * fx), Math.floor(height * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        brightest = Math.max(brightest, pixel[0] + pixel[1] + pixel[2]);
      }
    } catch {
      onFail();
      return;
    }
    if (brightest < 8) onFail();
  }, 2);
  return null;
}

function GradePasses() {
  const voice = useLab((s) => s.voice);
  const theme = useLab((s) => s.theme);
  
  const samples = 4;
  const smooth = <SMAA preset={SMAAPreset.HIGH} />;
  const grade = <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />;
  if (theme === "light" || voice === 1) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={samples}>
        <Bloom intensity={theme === "light" ? 0.05 : 0.045} luminanceThreshold={0.96} luminanceSmoothing={0.2} mipmapBlur radius={0.2} />
        {grade}
        {smooth}
      </EffectComposer>
    );
  }
  if (voice === 2) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={samples}>
        <Bloom intensity={0.12} luminanceThreshold={0.86} luminanceSmoothing={0.2} mipmapBlur radius={0.28} />
        {grade}
        {smooth}
        <Scanline density={0.55} opacity={0.028} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer enableNormalPass={false} multisampling={samples}>
      <Bloom intensity={0.35} luminanceThreshold={0.78} luminanceSmoothing={0.2} mipmapBlur radius={0.32} />
      {grade}
      {smooth}
      <Vignette eskil={false} offset={0.35} darkness={0.42} />
    </EffectComposer>
  );
}

export default function VoiceGrade() {
  const gl = useThree((s) => s.gl);
  const quality = useLab((s) => s.quality);
  const [off, setOff] = useState(false);
  const composerOn = !off && gl.capabilities.isWebGL2 && quality === "high";
  if (!composerOn) return null;
  const fail = () => setOff(true);
  return (
    <GradeBoundary onFail={fail}>
      <GradePasses />
      <GradeWatch onFail={fail} />
    </GradeBoundary>
  );
}
