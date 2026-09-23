import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  NavLockProvider,
  useNavLock,
  useNavLockState,
} from "@/src/components/design/NavLock";

function Holder({ on }: { on: boolean }) {
  useNavLock(on);
  return null;
}

function Probe() {
  const { locked } = useNavLockState();
  return <p>{locked ? "locked" : "open"}</p>;
}

function tree(a: boolean, b: boolean): ReactNode {
  return (
    <NavLockProvider>
      <Holder on={a} />
      <Holder on={b} />
      <Probe />
    </NavLockProvider>
  );
}

describe("NavLock", () => {
  it("stays locked until every holder lets go", () => {
    const { rerender } = render(tree(false, false));
    expect(screen.getByText("open")).toBeInTheDocument();
    rerender(tree(true, true));
    expect(screen.getByText("locked")).toBeInTheDocument();
    rerender(tree(false, true));
    expect(screen.getByText("locked")).toBeInTheDocument();
    rerender(tree(false, false));
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("lets go when the page that held it unmounts", () => {
    const { rerender } = render(
      <NavLockProvider>
        <Holder on />
        <Probe />
      </NavLockProvider>,
    );
    expect(screen.getByText("locked")).toBeInTheDocument();
    rerender(
      <NavLockProvider>
        <Probe />
      </NavLockProvider>,
    );
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("counts each release, so readers can tell a job just finished", () => {
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => {
        useNavLock(on);
        return useNavLockState();
      },
      {
        initialProps: { on: false },
        wrapper: ({ children }) => (
          <NavLockProvider>{children}</NavLockProvider>
        ),
      },
    );
    const start = result.current.releases;
    rerender({ on: true });
    expect(result.current.releases).toBe(start);
    rerender({ on: false });
    expect(result.current.releases).toBe(start + 1);
  });

  // Page unit tests render pages without the root layout.
  it("is a no-op outside the provider", () => {
    const { result } = renderHook(() => {
      useNavLock(true);
      return useNavLockState();
    });
    expect(result.current.locked).toBe(false);
  });
});
