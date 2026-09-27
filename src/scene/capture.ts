let job: ((url: string) => void) | null = null;

export function requestShot(callback: (url: string) => void): void {
  job = callback;
}

export function takeShot(): ((url: string) => void) | null {
  const current = job;
  job = null;
  return current;
}
