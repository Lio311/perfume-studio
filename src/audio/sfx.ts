import { finishById } from "../model/materials.ts";
import type { FinishId } from "../model/types.ts";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let humGain: GainNode | null = null;
let humNodes: AudioNode[] = [];
let lastTick = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  context();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide?: number): void {
  const audio = context();
  if (!audio || !master) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, fromHz: number, toHz: number): void {
  const audio = context();
  if (!audio || !master) return;
  const length = Math.max(1, Math.floor(audio.sampleRate * dur));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  const t = audio.currentTime;
  filter.frequency.setValueAtTime(fromHz, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, toHz), t + dur);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function playTick(): void {
  const now = performance.now();
  if (now - lastTick < 70) return;
  lastTick = now;
  tone(1680, 0.035, "sine", 0.025);
}

export function playClick(): void {
  noise(0.045, 0.05, 2200, 900);
  tone(420, 0.05, "triangle", 0.03);
}

export function playScan(): void {
  tone(140, 0.26, "sawtooth", 0.012, 880);
  noise(0.2, 0.028, 280, 1600);
}

export function playWhoosh(): void {
  noise(0.42, 0.07, 1600, 180);
  tone(240, 0.28, "sine", 0.02, 90);
}

export function playSnap(): void {
  noise(0.06, 0.08, 1400, 400);
  tone(520, 0.07, "triangle", 0.04, 180);
}

export function playGlass(): void {
  tone(3120, 0.22, "sine", 0.03);
  tone(4680, 0.16, "sine", 0.015);
}

export function playMetal(): void {
  tone(1480, 0.09, "square", 0.018);
  tone(2210, 0.07, "sine", 0.02);
  noise(0.04, 0.04, 3000, 1200);
}

export function playWood(): void {
  tone(186, 0.09, "sine", 0.05, 90);
  noise(0.07, 0.045, 420, 160);
}

export function playMaterial(finish: FinishId): void {
  if (finish === "wood" || finish === "leather") {
    playWood();
    return;
  }
  const group = finishById(finish).group;
  if (group === "glass") playGlass();
  else if (group === "metal") playMetal();
  else playWood();
}

export function startHum(): void {
  const audio = context();
  if (!audio || !master || humGain) return;
  humGain = audio.createGain();
  humGain.gain.value = 0.0001;
  humGain.connect(master);
  const low = audio.createOscillator();
  low.type = "sine";
  low.frequency.value = 74;
  const high = audio.createOscillator();
  high.type = "sine";
  high.frequency.value = 111;
  const highGain = audio.createGain();
  highGain.gain.value = 0.35;
  low.connect(humGain);
  high.connect(highGain);
  highGain.connect(humGain);
  low.start();
  high.start();
  humNodes = [low, high];
  const t = audio.currentTime;
  humGain.gain.exponentialRampToValueAtTime(0.045, t + 0.6);
}

export function stopHum(): void {
  if (!ctx || !humGain) {
    humNodes = [];
    humGain = null;
    return;
  }
  const gain = humGain;
  const nodes = humNodes;
  humGain = null;
  humNodes = [];
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  window.setTimeout(() => {
    for (const node of nodes) {
      try {
        (node as OscillatorNode).stop();
      } catch {
        /* already stopped */
      }
    }
    gain.disconnect();
  }, 280);
}

export function setMasterMuted(muted: boolean): void {
  if (!master || !ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? 0.0001 : 0.42, t, 0.04);
}
