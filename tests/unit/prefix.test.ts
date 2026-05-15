import { describe, it, expect } from "vitest";
import {
  formatPlaylistName,
  parsePlaylistName,
  hasPrefix,
} from "@/src/lib/categories/prefix";

describe("formatPlaylistName", () => {
  it("joins prefix and name with single space", () => {
    expect(formatPlaylistName("✨", "Aesthetic Rap")).toBe("✨ Aesthetic Rap");
  });
  it("does not double prefix if name already starts with it", () => {
    expect(formatPlaylistName("✨", "✨ Aesthetic Rap")).toBe(
      "✨ Aesthetic Rap",
    );
  });
  it("round-trips with parsePlaylistName", () => {
    const formatted = formatPlaylistName("★", "Late-Night R&B");
    expect(parsePlaylistName("★", formatted)).toEqual({
      name: "Late-Night R&B",
      hasPrefix: true,
    });
  });
});

describe("parsePlaylistName", () => {
  it("returns hasPrefix: false when name does not match prefix", () => {
    expect(parsePlaylistName("✨", "Random Playlist")).toEqual({
      name: "Random Playlist",
      hasPrefix: false,
    });
  });
  it("handles unicode prefix", () => {
    expect(parsePlaylistName("🎧", "🎧 Late Vibes")).toEqual({
      name: "Late Vibes",
      hasPrefix: true,
    });
  });
});

describe("hasPrefix", () => {
  it("true when name starts with prefix + space", () => {
    expect(hasPrefix("✨", "✨ Foo")).toBe(true);
  });
  it("false when prefix is missing the space", () => {
    expect(hasPrefix("✨", "✨Foo")).toBe(false);
  });
});
