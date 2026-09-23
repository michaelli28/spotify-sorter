// Port of covers.py's CoverSpec, _candidate, _spec, spec_for and catalogue_specs.
import { mulberry32 } from "./hash";
import { B_INKS, TEMP_INK, type InkName } from "./inks";
import { effectiveTemperature, sleeveSeed, type SleeveSource } from "./lexicon";
import type { Temperature } from "./temperature";

/** Shop-native shapes only. None may read as a chart: every bar on these pages is data. */
export const MOTIFS = [
  "groove",
  "split",
  "sleeves",
  "waves",
  "pull",
  "spines",
] as const;
export type Motif = (typeof MOTIFS)[number];

/** 6 motifs x 7 = 42 slots; beyond that the cap lifts to the least-used motif. */
export const MOTIF_CAP = 7;

export interface SleeveSpec {
  seed: number;
  temp: Temperature;
  inkA: InkName;
  inkB: InkName;
  motif: Motif;
  /** Quarter turns about the centre (0-3). */
  turn: number;
  /** Drum B's misregistration, in sleeve units (±1.6 or ±2.4). */
  dx: number;
  dy: number;
}

/** A bump walks the motif first, then ink B, so a clash never changes the temperature's ink A. */
function candidate(
  seed: number,
  temp: Temperature,
  bump: number,
): [Motif, InkName] {
  const motif =
    MOTIFS[(((seed >>> 16) % MOTIFS.length) + bump) % MOTIFS.length];
  const inkB =
    B_INKS[temp][(((seed >>> 6) & 3) + Math.floor(bump / MOTIFS.length)) & 3];
  return [motif, inkB];
}

const OFFSETS = [-2.4, -1.6, 1.6, 2.4] as const;

function build(
  seed: number,
  temp: Temperature,
  motif: Motif,
  inkB: InkName,
): SleeveSpec {
  const rand = mulberry32(seed);
  const dx = OFFSETS[Math.floor(rand() * 4)];
  const dy = OFFSETS[Math.floor(rand() * 4)];
  let turn = (seed >>> 26) % 4;
  if (motif === "spines") turn &= 2; // records stand up: on their side, spines read as a striped list
  return { seed, temp, inkA: TEMP_INK[temp], inkB, motif, turn, dx, dy };
}

/** A category's sleeve with no catalogue context (bump 0). Prefer `catalogueSpecs`. */
export function specFor(c: SleeveSource, bump = 0): SleeveSpec {
  const seed = sleeveSeed(c);
  const temp = effectiveTemperature(c);
  const [motif, inkB] = candidate(seed, temp, bump);
  return build(seed, temp, motif, inkB);
}

interface Tally {
  cap: number;
  perMotif: ReadonlyMap<Motif, number>;
  /** How often this temperature has used each motif so far. */
  used: ReadonlyMap<Motif, number>;
  /** "temp|motif|inkB" keys already taken; null ignores them. */
  held: ReadonlySet<string> | null;
}

/** The candidate whose motif its temperature has used least, then the smallest bump. */
function choose(
  seed: number,
  temp: Temperature,
  t: Tally,
): [Motif, InkName] | null {
  let best: [Motif, InkName] | null = null;
  let bestUse = Infinity;
  for (let bump = 0; bump < MOTIFS.length * 4; bump++) {
    const [motif, inkB] = candidate(seed, temp, bump);
    if (
      t.held?.has(`${temp}|${motif}|${inkB}`) ||
      (t.perMotif.get(motif) ?? 0) >= t.cap
    )
      continue;
    const use = t.used.get(motif) ?? 0;
    // Bumps ascend, so a tie keeps the smaller bump.
    if (use < bestUse) [best, bestUse] = [[motif, inkB], use];
  }
  return best;
}

interface Indexed {
  specs: Map<string, SleeveSpec>;
  byId: Map<string, SleeveSource>;
}

const memo = new WeakMap<readonly SleeveSource[], Indexed>();

/** Whether two versions of a category print the same sleeve. */
function samePrint(a: SleeveSource, b: SleeveSource): boolean {
  return (
    a.name === b.name &&
    (a.description ?? "") === (b.description ?? "") &&
    a.temperature === b.temperature
  );
}

/**
 * `c`'s spec within its catalogue (the categories in catalogue order), printed from `c`
 * itself: an unsaved rename, description or colour override reprints it even when
 * `catalogue` is the saved list. It is computed as if `c` replaced its saved entry, or,
 * when the catalogue lacks it (just added), as if appended. The saved catalogue is
 * memoised per array, so 41 sleeves sharing one list compute it once.
 */
export function specInCatalogue(
  c: SleeveSource,
  catalogue: readonly SleeveSource[],
): SleeveSpec {
  let saved = memo.get(catalogue);
  if (!saved) {
    saved = {
      specs: catalogueSpecs(catalogue),
      byId: new Map(catalogue.map((x) => [x.id, x])),
    };
    memo.set(catalogue, saved);
  }
  const entry = saved.byId.get(c.id);
  if (entry && samePrint(entry, c)) return saved.specs.get(c.id)!;
  const edited = entry
    ? catalogue.map((x) => (x.id === c.id ? c : x))
    : [...catalogue, c];
  return catalogueSpecs(edited).get(c.id)!;
}

/**
 * Walks the catalogue in order. Each category takes, of its 24 (motif, ink B) candidates:
 * - never a (temperature, motif, ink B) an earlier category holds, and never a motif
 *   already used MOTIF_CAP times;
 * - among the rest, the motif its temperature has used least so far, then the smallest bump.
 * Adding a category never reprints an existing one: it only reads what came before it.
 * An owner's temperature override counts (it changes ink A and the ink B palette).
 *
 * Deviation from covers.py: a temperature has only 24 combinations, so its 25th category
 * finds none free and covers.py raises. Here that category reuses one instead, so a page
 * still renders. Every catalogue covers.py accepts gets identical specs.
 */
export function catalogueSpecs(
  cats: readonly SleeveSource[],
): Map<string, SleeveSpec> {
  const held = new Set<string>();
  const perMotif = new Map<Motif, number>(MOTIFS.map((m) => [m, 0]));
  const perTemp = new Map<Temperature, Map<Motif, number>>();
  const out = new Map<string, SleeveSpec>();
  for (const c of cats) {
    const seed = sleeveSeed(c);
    const temp = effectiveTemperature(c);
    const least = Math.min(...perMotif.values());
    const cap = least < MOTIF_CAP ? MOTIF_CAP : least + 1;
    const used = perTemp.get(temp) ?? new Map<Motif, number>();
    // The cap always leaves a motif below it, so the pass that ignores `held` always finds one.
    const [motif, inkB] =
      choose(seed, temp, { cap, perMotif, used, held }) ??
      choose(seed, temp, { cap, perMotif, used, held: null })!;
    held.add(`${temp}|${motif}|${inkB}`);
    perMotif.set(motif, (perMotif.get(motif) ?? 0) + 1);
    perTemp.set(temp, new Map(used).set(motif, (used.get(motif) ?? 0) + 1));
    out.set(c.id, build(seed, temp, motif, inkB));
  }
  return out;
}
