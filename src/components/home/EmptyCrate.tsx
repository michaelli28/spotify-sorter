import {
  CrateBack,
  CrateDivider,
  CrateFigure,
  CrateLayer,
  CrateSlats,
  CrateTab,
} from "@/src/components/graphics/Crate";
import { crateLayout } from "@/src/components/graphics/crate-geometry";
import { Tab } from "@/src/components/graphics/Tab";

const BLANK = crateLayout([{ count: 0 }])[0]!;

/**
 * Before there are categories (brief §3 Home): the crate stands empty but for
 * one blank divider, its dashed tab waiting for number 01. A picture only.
 */
export function EmptyCrate() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[440px] justify-self-center desk:justify-self-end"
    >
      <CrateFigure>
        <CrateLayer>
          <CrateBack />
          <CrateDivider divider={BLANK} temperature={null} />
        </CrateLayer>
        <CrateTab divider={BLANK}>
          <Tab catalogueNo={1} temperature={null} size="crate" />
        </CrateTab>
        <CrateSlats />
      </CrateFigure>
    </div>
  );
}
