import { describe, expect, it } from "vitest";
import { useContext } from "react";
import { render, screen } from "@testing-library/react";
import { MotionConfigContext } from "framer-motion";
import { MotionRoot } from "@/src/components/design/MotionRoot";

function Probe() {
  const { reducedMotion } = useContext(MotionConfigContext);
  return <p>{reducedMotion}</p>;
}

describe("MotionRoot", () => {
  // The nav and the top strip sit outside PageTransition's MotionConfig, so
  // the root layout needs its own to honour the OS setting there too.
  it("follows the OS reduced-motion setting for everything inside it", () => {
    render(
      <MotionRoot>
        <Probe />
      </MotionRoot>,
    );
    expect(screen.getByText("user")).toBeInTheDocument();
  });
});
