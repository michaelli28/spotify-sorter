import { describe, expect, it } from "vitest";
import type { Assignment } from "@/src/lib/cache";
import {
  dragId,
  dropDestination,
  moveMessage,
  otherPlaylistsLeft,
  pin,
} from "@/src/components/classify/moves";

const SAD: Assignment = {
  matches: [
    { category_id: "emo", score: 87 },
    { category_id: "bedroom", score: 70 },
    { category_id: "drive", score: 66 },
  ],
  classified_at: "2026-09-01T00:00:00.000Z",
  override: null,
};

describe("dragId", () => {
  // Every copy of a song shared one id, so dnd-kit measured the wrong copy and
  // drops onto a playlist silently failed.
  it("differs for the same song in two playlists", () => {
    expect(dragId("emo", "t1")).toBe("chip:emo:t1");
    expect(dragId("emo", "t1")).not.toBe(dragId("bedroom", "t1"));
  });
});

describe("dropDestination", () => {
  it("moves a song to the playlist it was dropped on", () => {
    expect(
      dropDestination(
        { trackId: "t1", fromCategoryId: "emo" },
        { categoryId: "bedroom" },
      ),
    ).toBe("bedroom");
  });

  // Dropping a song back where it came from used to pin it there silently.
  it("ignores a drop onto the playlist the song came from", () => {
    expect(
      dropDestination(
        { trackId: "t1", fromCategoryId: "emo" },
        { categoryId: "emo" },
      ),
    ).toBeNull();
  });

  it("ignores a drop outside any playlist", () => {
    expect(
      dropDestination({ trackId: "t1", fromCategoryId: "emo" }, undefined),
    ).toBeNull();
  });
});

describe("pin", () => {
  it("pins the song to one playlist and keeps the model's answer", () => {
    const next = pin(SAD, "bedroom", "2026-09-23T10:00:00.000Z");
    expect(next).toEqual({
      ...SAD,
      override: {
        category_id: "bedroom",
        set_at: "2026-09-23T10:00:00.000Z",
      },
    });
  });

  it("leaves the previous assignment untouched, so Undo can send it back", () => {
    pin(SAD, "bedroom", "2026-09-23T10:00:00.000Z");
    expect(SAD.override).toBeNull();
  });
});

describe("otherPlaylistsLeft", () => {
  it("counts the playlists a move takes the song out of, besides source and target", () => {
    // In emo, bedroom and drive at 65; moved emo → rust: leaves bedroom, drive.
    expect(otherPlaylistsLeft(SAD, 65, "emo", "rust")).toBe(2);
    // Moved emo → bedroom: only drive is also left.
    expect(otherPlaylistsLeft(SAD, 65, "emo", "bedroom")).toBe(1);
    // At 80 it was only in emo.
    expect(otherPlaylistsLeft(SAD, 80, "emo", "bedroom")).toBe(0);
  });
});

describe("moveMessage", () => {
  it("names the song and where it went", () => {
    expect(moveMessage("SAD!", "Bedroom Pop Intimacy", 0)).toBe(
      "‘SAD!’ → Bedroom Pop Intimacy.",
    );
  });

  it("says when the song also left other playlists", () => {
    expect(moveMessage("SAD!", "Bedroom Pop Intimacy", 1)).toBe(
      "‘SAD!’ → Bedroom Pop Intimacy. Also left 1 other playlist.",
    );
    expect(moveMessage("SAD!", "Bedroom Pop Intimacy", 3)).toBe(
      "‘SAD!’ → Bedroom Pop Intimacy. Also left 3 other playlists.",
    );
  });
});
