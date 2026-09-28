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
      "--bg": "#06070b",
      "--panel": "rgba(14, 16, 24, 0.58)",
      "--panel-2": "rgba(8, 10, 16, 0.78)",
      "--line": "rgba(214, 178, 106, 0.26)",
      "--line-strong": "rgba(214, 178, 106, 0.55)",
      "--text": "#EDE8DD",
      "--muted": "#8f8c86",
      "--faint": "#6e685e",
      "--accent": "#D6B26A",
      "--accent-2": "#f3e6cc",
      "--on-accent": "#141109",
      "--danger": "#ff7a7a",
      "--good": "#3ddc97",
      "--shadow": "0 22px 60px rgba(0, 0, 0, 0.42)",
      "--inset": "inset 0 1px 0 rgba(255, 248, 236, 0.08)",
      "--thumb": "rgba(255, 255, 255, 0.035)",
      "--fill": "rgba(212, 180, 138, 0.14)",
      "--vignette": "rgba(0, 0, 0, 0.32)",
    },
    scene: {
      top: "#0b0e17",
      bottom: "#030306",
      gridCell: "#16303c",
      gridSection: "#2f6f85",
      ambient: "#e6e0d4",
      ambientIntensity: 0.55,
      key: "#fff8ee",
      keyIntensity: 1.65,
      fill: "#c5d0e4",
      fillIntensity: 0.72,
      rim: "#9fd4e4",
      rimIntensity: 0.9,
      exposure: 1.0,
      under: "#1a1e26",
      shadow: 0.5,
    },
  },
  light: {
    id: "light",
    css: {
      "--bg": "#e8ebf0",
      "--panel": "rgba(255, 255, 255, 0.84)",
      "--panel-2": "rgba(255, 255, 255, 0.94)",
      "--line": "rgba(26, 29, 34, 0.12)",
      "--line-strong": "rgba(26, 29, 34, 0.28)",
      "--text": "#1a1d22",
      "--muted": "#5c6370",
      "--faint": "#7b828e",
      "--accent": "#9a7b4a",
      "--accent-2": "#1a1d22",
      "--on-accent": "#1a140c",
      "--danger": "#a33d3d",
      "--good": "#2f6b4f",
      "--shadow": "0 16px 40px rgba(22, 26, 34, 0.08)",
      "--inset": "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
      "--thumb": "rgba(255, 255, 255, 0.7)",
      "--fill": "rgba(154, 123, 74, 0.1)",
      "--vignette": "rgba(30, 36, 48, 0.05)",
    },
    scene: {
      top: "#f7f8fa",
      bottom: "#dfe3e8",
      gridCell: "#c5ccd4",
      gridSection: "#9aa3ae",
      ambient: "#f4f6f8",
      ambientIntensity: 0.62,
      key: "#ffffff",
      keyIntensity: 2.15,
      fill: "#d5deea",
      fillIntensity: 0.55,
      rim: "#ffffff",
      rimIntensity: 0.35,
      exposure: 1.08,
      under: "#c5ccd6",
      shadow: 0.16,
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
