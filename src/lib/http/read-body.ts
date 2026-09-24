// Stops reading past maxBytes, so an oversized body is never held in memory.
// null = too large.
export async function readBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
