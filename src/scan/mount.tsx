import { createRoot } from "react-dom/client";
import { ScanApp } from "./ScanApp.tsx";

export function mountScan(root: HTMLElement = document.getElementById("root")!) {
  const splash = document.getElementById("studio-splash");
  if (splash) {
    splash.classList.add("is-out");
    splash.style.display = "none";
  }
  createRoot(root).render(<ScanApp />);
}
