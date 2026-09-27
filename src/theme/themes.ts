export type ThemeId = "dark" | "light";

export interface Theme {
  id: ThemeId;
  css: Record<string, string>;
  scene: {
    top: string;
    bottom: string;
    gridCell: string;
    gridSection: string;
    ambient: string;
    ambientIntensity: number;
    key: string;
    keyIntensity: number;
    fill: string;
    fillIntensity: number;
    rim: string;
    rimIntensity: number;
    exposure: number;
    under: string;
    shadow: number;
  };
}

export const themes: Record<ThemeId, Theme> = {
  dark: {
    id: "dark",
    css: {
      "--bg": "#0b0d11",
      "--panel": "rgba(16, 20, 26, 0.58)",
      "--panel-2": "rgba(10, 12, 16, 0.78)",
      "--line": "rgba(212, 180, 138, 0.28)",
      "--line-strong": "rgba(212, 180, 138, 0.62)",
      "--text": "#f3efe8",
      "--muted": "#9a9388",
      "--faint": "#6e685e",
      "--accent": "#d4b48a",
      "--accent-2": "#f3e6cc",
      "--danger": "#e07a72",
      "--good": "#9dbea8",
      "--shadow": "0 22px 60px rgba(0, 0, 0, 0.42)",
      "--inset": "inset 0 1px 0 rgba(255, 248, 236, 0.08)",
      "--thumb": "rgba(255, 255, 255, 0.035)",
      "--fill": "rgba(212, 180, 138, 0.14)",
      "--vignette": "rgba(0, 0, 0, 0.32)",
    },
    scene: {
      top: "#141820",
      bottom: "#0b0d11",
      gridCell: "#1c3942",
      gridSection: "#3c6570",
      ambient: "#e6e0d4",
      ambientIntensity: 0.55,
      key: "#fff8ee",
      keyIntensity: 1.65,
      fill: "#c5d0e4",
      fillIntensity: 0.72,
      rim: "#f0d7b0",
      rimIntensity: 1.25,
      exposure: 1.0,
      under: "#e7c48a",
      shadow: 0.5,
    },
  },
  light: {
    id: "light",
    css: {
      "--bg": "#f3f0ea",
      "--panel": "rgba(255, 252, 248, 0.78)",
      "--panel-2": "rgba(255, 252, 248, 0.92)",
      "--line": "rgba(90, 70, 40, 0.16)",
      "--line-strong": "rgba(122, 90, 48, 0.45)",
      "--text": "#1b1916",
      "--muted": "#6f685e",
      "--faint": "#8a8276",
      "--accent": "#8d6a3a",
      "--accent-2": "#3d3428",
      "--danger": "#a33d3d",
      "--good": "#2f6b4f",
      "--shadow": "0 18px 50px rgba(70, 54, 30, 0.12)",
      "--inset": "inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      "--thumb": "rgba(255, 255, 255, 0.55)",
      "--fill": "rgba(141, 106, 58, 0.1)",
      "--vignette": "rgba(80, 64, 40, 0.08)",
    },
    scene: {
      top: "#f7f4ee",
      bottom: "#e6e0d6",
      gridCell: "#ddd4c6",
      gridSection: "#c3b39a",
      ambient: "#fff8ef",
      ambientIntensity: 0.55,
      key: "#ffffff",
      keyIntensity: 2.4,
      fill: "#f0e4d4",
      fillIntensity: 0.7,
      rim: "#ffffff",
      rimIntensity: 0.45,
      exposure: 1.12,
      under: "#d9c4a4",
      shadow: 0.28,
    },
  },
};

export function applyTheme(id: ThemeId): void {
  const theme = themes[id];
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = id === "dark" ? "dark" : "light";
  for (const [key, value] of Object.entries(theme.css)) root.style.setProperty(key, value);
}
