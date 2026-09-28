import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/600.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/italiana/latin-400.css";
import "@fontsource/great-vibes/latin-400.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./ui/FallbackScreen.tsx";
import "./index.css";

document.fonts?.load('400 16px Heebo', "אבג ABC");
document.fonts?.load('600 16px Heebo', "אבג ABC");
document.fonts?.load('600 48px "Cormorant Garamond"', "ABC");
document.fonts?.load('600 48px Cinzel', "ABC");
document.fonts?.load('400 48px Italiana', "ABC");
document.fonts?.load('400 48px "Great Vibes"', "ABC");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
