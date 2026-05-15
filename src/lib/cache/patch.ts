import type { Cache } from "./schema";

type Patch = {
  [K in keyof Cache]?: Cache[K] extends Record<string, unknown>
    ? Partial<Cache[K]>
    : Cache[K];
};

export function patchCache(cache: Cache, patch: Patch): Cache {
  const next: Cache = { ...cache };
  for (const key of Object.keys(patch) as Array<keyof Patch>) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    const current = cache[key];
    if (
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      typeof incoming === "object" &&
      !Array.isArray(incoming)
    ) {
      (next as Record<string, unknown>)[key as string] = {
        ...current,
        ...incoming,
      };
    } else {
      (next as Record<string, unknown>)[key as string] = incoming;
    }
  }
  return next;
}
