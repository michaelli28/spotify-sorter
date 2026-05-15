import type { Assignment } from "@/src/lib/cache";

export function applyOverride(
  assignment: Assignment,
  categoryId: string,
): Assignment {
  return {
    ...assignment,
    override: { category_id: categoryId, set_at: new Date().toISOString() },
  };
}

export function clearOverride(assignment: Assignment): Assignment {
  return { ...assignment, override: null };
}
