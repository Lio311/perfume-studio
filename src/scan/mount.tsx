import { createRoot } from "react-dom/client";
import { ScanApp } from "./ScanApp.tsx";

export function mountScan(root: HTMLElement = document.getElementById("root")!) {
  document.getElementById("studio-splash")?.classList.add("is-out");
  createRoot(root).render(<ScanApp />);
}
