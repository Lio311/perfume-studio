let appMounted = false;
let sceneFramed = false;
let removed = false;

function dismissSplash(): void {
  if (!appMounted || !sceneFramed || removed) return;
  if (typeof document === "undefined") {
    removed = true;
    return;
  }
  const splash = document.getElementById("studio-splash");
  if (!splash) {
    removed = true;
    return;
  }
  removed = true;
  splash.classList.add("is-out");
  splash.setAttribute("aria-hidden", "true");
  const done = () => {
    splash.remove();
  };
  splash.addEventListener("transitionend", done, { once: true });
  window.setTimeout(done, 700);
}

/** The React tree has committed. The splash stays until the scene draws. */
export function noteAppMounted(): void {
  appMounted = true;
  dismissSplash();
}

/** The canvas drew its first frame, or the studio fell back and will not draw one. */
export function noteStudioFrame(): void {
  sceneFramed = true;
  dismissSplash();
  try { sessionStorage.removeItem("perfume-lab-preload-reloaded"); } catch {}
}
