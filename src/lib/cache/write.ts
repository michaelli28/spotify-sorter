import * as fs from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { CacheSchema, type Cache } from "./schema";

export async function writeCache(path: string, cache: Cache): Promise<void> {
  CacheSchema.parse(cache);
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
  await fs.rename(tmp, path);
}
