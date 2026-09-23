import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";

const ID = "4uLU6hMCjMI75M1A2tKUQC"; // 22 base-62 characters, like every Spotify track id
const NAME = "drive by Current Blue";
// next/image may write the resolved URL into src; the request path is what matters.
const path = (img: HTMLImageElement | null | undefined) =>
  img ? new URL(img.src).pathname : null;

afterEach(() => vi.restoreAllMocks());

describe("<AlbumArt>", () => {
  it("loads the art lazily from the app's art route", () => {
    const { container } = render(<AlbumArt trackId={ID} label={NAME} />);
    const img = container.querySelector("img")!;
    expect(path(img)).toBe(`/api/art/${ID}`);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", "44");
    expect(img).toHaveAttribute("alt", "");
  });

  it("links to the track in Spotify", () => {
    render(<AlbumArt trackId={ID} label="drive by Current Blue" />);
    const link = screen.getByRole("link", { name: "drive by Current Blue" });
    expect(link).toHaveAttribute("href", `spotify:track:${ID}`);
  });

  it("needs a name for its link, so three records in a row don't all read 'Open in Spotify'", () => {
    // @ts-expect-error: a linked AlbumArt must say which track it opens.
    const unnamed = <AlbumArt trackId={ID} />;
    // @ts-expect-error: an unlinked one has no link to name.
    const stray = <AlbumArt trackId={ID} link={false} label="x" />;
    expect([unnamed, stray]).toHaveLength(2);
  });

  it("can sit inside a row that is already the link", () => {
    const { container } = render(<AlbumArt trackId={ID} link={false} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("swaps to the plain sleeve when the art fails to load", () => {
    const { container } = render(
      <AlbumArt trackId={ID} size={40} label={NAME} />,
    );
    fireEvent.error(container.querySelector("img")!);
    const plain = screen.getByRole("img", { name: "No cover art" });
    expect(plain).toHaveAttribute("width", "40");
    expect(container.querySelector("img")).toBeNull();
  });

  it("swaps even when the art failed before React hydrated", () => {
    // Server-rendered <img>: a fast 404 fires `error` before any handler is attached.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      0,
    );
    render(<AlbumArt trackId={ID} label={NAME} />);
    expect(
      screen.getByRole("img", { name: "No cover art" }),
    ).toBeInTheDocument();
  });

  it("keeps art that loaded before hydration", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      64,
    );
    const { container } = render(<AlbumArt trackId={ID} label={NAME} />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("tries again for a new track after one failed", () => {
    const { container, rerender } = render(
      <AlbumArt trackId={ID} label={NAME} />,
    );
    fireEvent.error(container.querySelector("img")!);
    rerender(<AlbumArt trackId="0VjIjW4GlUZAMYd2vXMi3b" label={NAME} />);
    expect(path(container.querySelector("img"))).toBe(
      "/api/art/0VjIjW4GlUZAMYd2vXMi3b",
    );
  });

  it("never requests an id the art route would reject", () => {
    const { container } = render(
      <AlbumArt trackId="../../etc/passwd" label={NAME} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("img", { name: "No cover art" }),
    ).toBeInTheDocument();
  });
});
