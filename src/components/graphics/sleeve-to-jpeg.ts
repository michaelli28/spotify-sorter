// Spec §3.4: after Apply writes a playlist, the browser prints its sleeve as a
// real Spotify cover. Browser-only (canvas); the stepping logic takes an encoder.
import type { SleeveSpec } from "@/src/lib/sleeves/spec";
import { sleeveSvgString } from "@/src/lib/sleeves/svg";

export const COVER_PX = 640;
/** Spotify's limit on the base64 JPEG payload for a playlist cover. */
export const COVER_MAX_BASE64 = 256 * 1024;
/** Tried in order until the payload fits. */
export const QUALITIES = [0.92, 0.85, 0.78, 0.71, 0.64, 0.57, 0.5] as const;

/** Encodes the rasterised sleeve at a JPEG quality; returns a data: URL. */
export type JpegEncoder = (quality: number) => string | Promise<string>;
export type Rasterize = (svg: string, px: number) => Promise<JpegEncoder>;

export class CoverTooLargeError extends Error {
  constructor(readonly base64Length: number) {
    super(
      `cover is ${base64Length} bytes of base64 at quality 0.5, over ${COVER_MAX_BASE64}`,
    );
    this.name = "CoverTooLargeError";
  }
}

const PREFIX = "data:image/jpeg;base64,";

/** The first quality (0.92 down to 0.5) whose base64 payload is ≤ 256 KB, without the data: prefix. */
export async function pickJpeg(
  encode: JpegEncoder,
  maxBase64 = COVER_MAX_BASE64,
): Promise<string> {
  let last = 0;
  for (const q of QUALITIES) {
    const url = await encode(q);
    // A canvas that can't encode JPEG silently falls back to PNG; Spotify takes JPEG only.
    if (!url.startsWith(PREFIX))
      throw new Error("canvas did not encode a JPEG");
    const b64 = url.slice(PREFIX.length);
    if (b64.length <= maxBase64) return b64;
    last = b64.length;
  }
  throw new CoverTooLargeError(last);
}

/** Draws the SVG on a px x px canvas; the encoder reads that canvas back as JPEG. */
async function rasterizeInBrowser(
  svg: string,
  px: number,
): Promise<JpegEncoder> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image(px, px);
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.drawImage(img, 0, 0, px, px);
    return (q) => canvas.toDataURL("image/jpeg", q);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A category's sleeve as a 640x640 JPEG, base64 without the data: prefix, ≤ 256 KB. */
export async function sleeveToJpeg(
  spec: SleeveSpec,
  rasterize: Rasterize = rasterizeInBrowser,
): Promise<string> {
  return pickJpeg(await rasterize(sleeveSvgString(spec, COVER_PX), COVER_PX));
}
