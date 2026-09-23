import { describe, it, expect, vi } from "vitest";
import reference from "@/tests/fixtures/sleeve-reference.json";
import {
  COVER_MAX_BASE64,
  COVER_PX,
  CoverTooLargeError,
  QUALITIES,
  pickJpeg,
  sleeveToJpeg,
} from "@/src/components/graphics/sleeve-to-jpeg";
import { catalogueSpecs } from "@/src/lib/sleeves/spec";
import { sleeveSvgString } from "@/src/lib/sleeves/svg";

const KB = 1024;
/** A fake encoder: the base64 payload length each quality produces. */
function encoderOf(sizes: Record<number, number>) {
  return vi.fn(
    (q: number) => `data:image/jpeg;base64,${"A".repeat(sizes[q] ?? 0)}`,
  );
}

describe("pickJpeg", () => {
  it("steps quality down from 0.92 to 0.5", () => {
    expect(QUALITIES[0]).toBe(0.92);
    expect(QUALITIES[QUALITIES.length - 1]).toBe(0.5);
    for (let i = 1; i < QUALITIES.length; i++) {
      expect(QUALITIES[i]).toBeLessThan(QUALITIES[i - 1]);
    }
  });

  it("keeps the first quality whose base64 payload fits Spotify's 256 KB, without the data: prefix", async () => {
    const encode = encoderOf({ 0.92: 100 * KB });
    const b64 = await pickJpeg(encode);
    expect(b64).toBe("A".repeat(100 * KB));
    expect(encode.mock.calls.map(([q]) => q)).toEqual([0.92]);
  });

  it("steps down until it fits", async () => {
    const encode = encoderOf({
      0.92: 300 * KB,
      0.85: 270 * KB,
      0.78: 200 * KB,
    });
    const b64 = await pickJpeg(encode);
    expect(b64).toHaveLength(200 * KB);
    expect(encode.mock.calls.map(([q]) => q)).toEqual([0.92, 0.85, 0.78]);
  });

  it("accepts a payload of exactly 256 KB", async () => {
    expect(COVER_MAX_BASE64).toBe(256 * KB);
    const b64 = await pickJpeg(encoderOf({ 0.92: 256 * KB }));
    expect(b64).toHaveLength(256 * KB);
  });

  it("gives up after 0.5 with a typed error", async () => {
    const big = Object.fromEntries(QUALITIES.map((q) => [q, 300 * KB]));
    const encode = encoderOf(big);
    await expect(pickJpeg(encode)).rejects.toBeInstanceOf(CoverTooLargeError);
    expect(encode).toHaveBeenCalledTimes(QUALITIES.length);
    expect(encode.mock.calls.at(-1)![0]).toBe(0.5);
  });

  it("refuses anything the canvas didn't encode as JPEG", async () => {
    await expect(pickJpeg(() => "data:image/png;base64,AAAA")).rejects.toThrow(
      /JPEG/,
    );
  });

  it("waits for an async encoder", async () => {
    const b64 = await pickJpeg(async () => "data:image/jpeg;base64,QUJD");
    expect(b64).toBe("QUJD");
  });
});

describe("sleeveToJpeg", () => {
  it("rasterises the standalone sleeve at 640x640 and picks a quality", async () => {
    const [cat] = reference.categories;
    const spec = catalogueSpecs(reference.categories).get(cat.id)!;
    const rasterize = vi.fn(async () => encoderOf({ 0.92: 10 }));
    const b64 = await sleeveToJpeg(spec, rasterize);
    expect(COVER_PX).toBe(640);
    expect(rasterize).toHaveBeenCalledWith(sleeveSvgString(spec, 640), 640);
    expect(b64).toBe("A".repeat(10));
  });
});
