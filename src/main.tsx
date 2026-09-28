import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppErrorBoundary } from "./ui/FallbackScreen.tsx";
import "./index.css";

document.fonts?.load('500 16px Heebo');
document.fonts?.load('600 20px Syne');
document.fonts?.load('500 48px "Cormorant Garamond"');
document.fonts?.load('500 48px Cinzel');
document.fonts?.load('500 48px Italiana');
document.fonts?.load('400 48px "Great Vibes"');

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
