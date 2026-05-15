import type { Assignment } from "@/src/lib/cache";

export function trackPassesThreshold(
  assignment: Assignment,
  threshold: number,
): string[] {
  if (assignment.override) return [assignment.override.category_id];
  if (assignment.matches.length === 0) return [];
  const passing = assignment.matches
    .filter((m) => m.score >= threshold)
    .map((m) => m.category_id);
  if (passing.length > 0) return passing;
  const top = [...assignment.matches].sort((a, b) => b.score - a.score)[0]!;
  return [top.category_id];
}

export function categoryMembers(
  assignments: Record<string, Assignment>,
  threshold: number,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [trackId, assignment] of Object.entries(assignments)) {
    for (const categoryId of trackPassesThreshold(assignment, threshold)) {
      let set = map.get(categoryId);
      if (!set) {
        set = new Set();
        map.set(categoryId, set);
      }
      set.add(trackId);
    }
  }
  return map;
}
