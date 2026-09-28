import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/heebo/300.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/syne/latin-400.css";
import "@fontsource/syne/latin-500.css";
import "@fontsource/syne/latin-600.css";
import "@fontsource/syne/latin-700.css";
import "@fontsource/share-tech-mono/latin-400.css";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/italiana/latin-400.css";
import "@fontsource/great-vibes/latin-400.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./ui/FallbackScreen.tsx";
import "./index.css";

document.fonts?.load('300 16px Heebo', "אבג ABC");
document.fonts?.load('400 16px Heebo', "אבג ABC");
document.fonts?.load('500 28px Heebo', "אבג ABC");
document.fonts?.load('600 16px Heebo', "אבג ABC");
document.fonts?.load('400 12px Inter', "50");
document.fonts?.load('500 12px Inter', "50");
document.fonts?.load('600 12px Inter', "50");
document.fonts?.load('400 15px Syne', "PERFUME LAB");
document.fonts?.load('500 15px Syne', "PERFUME LAB");
document.fonts?.load('600 15px Syne', "PERFUME LAB");
document.fonts?.load('700 15px Syne', "PERFUME LAB");
document.fonts?.load('400 12px "Share Tech Mono"', "50");
document.fonts?.load('500 48px "Cormorant Garamond"', "ABC");
document.fonts?.load('600 48px "Cormorant Garamond"', "ABC");
document.fonts?.load('500 48px Cinzel', "ABC");
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
