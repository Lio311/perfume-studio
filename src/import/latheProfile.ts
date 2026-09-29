export interface LatheProfile {
  /** Radius samples from the base to the top, 0–1 of the widest point. */
  radii: number[];
}

const profiles = new Map<string, LatheProfile>();

export function clearLatheProfiles(): void {
  profiles.clear();
}

export function setLatheProfile(id: string, profile: LatheProfile | null): void {
  if (!profile || profile.radii.length < 4) profiles.delete(id);
  else profiles.set(id, profile);
}

export function latheProfile(id: string): LatheProfile | undefined {
  return profiles.get(id);
}
