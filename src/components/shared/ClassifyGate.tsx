"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/design/Button";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { estimateClassifyCost } from "@/src/lib/llm/cost";

export interface ClassifyGateProps {
  /** Tracks with no category: what the run pays for. */
  unsorted: number;
  label?: string;
}

// /classify spends as soon as it loads, so the only way there is past a price.
export function ClassifyGate({ unsorted, label }: ClassifyGateProps) {
  const router = useRouter();
  // "going": Proceed was pressed and /classify is loading. Nothing on this
  // page can cancel that, so nothing here offers to.
  const [stage, setStage] = useState<"idle" | "priced" | "going">("idle");
  const count = `${unsorted.toLocaleString("en-US")} ${unsorted === 1 ? "track" : "tracks"}`;
  return (
    <>
      <Button disabled={stage === "going"} onClick={() => setStage("priced")}>
        {label ?? `Sort ${count}`}
      </Button>
      <CostPreviewModal
        open={stage === "priced"}
        estimateUsd={estimateClassifyCost(unsorted)}
        message={`Claude sorts only the ${count} without a category.`}
        onConfirm={() => {
          setStage("going");
          router.push("/classify");
        }}
        onCancel={() => setStage("idle")}
      />
    </>
  );
}
