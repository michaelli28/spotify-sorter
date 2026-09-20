import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";

export const labelsDir = () => join(dataDir(), "labels");
export const samplePath = () => join(labelsDir(), "sample.json");
export const sampleDesignPath = () => join(labelsDir(), "sample-design.json");
export const goldSamplePath = () => join(labelsDir(), "gold-sample.json");
export const definitionsPath = () => join(labelsDir(), "definitions.md");
export const labelsPath = () => join(labelsDir(), "labels.jsonl");
