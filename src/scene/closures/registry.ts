import type { ClosureBuilder } from "./types.ts";

/** Geometry builders, one file per closure id. The filename is the id. */
const modules = import.meta.glob("./build/*.tsx", { eager: true }) as Record<string, { default?: ClosureBuilder }>;

const builders = new Map<string, ClosureBuilder>();
for (const [path, mod] of Object.entries(modules)) {
  const id = path.split("/").pop()?.replace(/\.tsx$/, "");
  if (id && mod.default) builders.set(id, mod.default);
}

export function builderFor(id: string): ClosureBuilder | undefined {
  return builders.get(id);
}

export function builderIds(): string[] {
  return [...builders.keys()];
}
