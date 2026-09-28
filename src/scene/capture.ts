let job: ((url: string) => void) | null = null;
let wait = 0;

export function requestShot(callback: (url: string) => void): void {
  job = callback;
  wait = 2;
}

export function shotPending(): boolean {
  return job !== null;
}

export function takeShot(): ((url: string) => void) | null {
  if (!job) return null;
  if (wait > 0) {
    wait -= 1;
    return null;
  }
  const current = job;
  job = null;
  return current;
}
