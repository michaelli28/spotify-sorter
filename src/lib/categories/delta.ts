export interface CategoryRef {
  id: string;
  name: string;
}

export interface CategoryDeltaResult {
  added: CategoryRef[];
  removed: CategoryRef[];
  unchanged: CategoryRef[];
}

export function categoryDelta(
  before: CategoryRef[],
  after: CategoryRef[],
): CategoryDeltaResult {
  const beforeIds = new Set(before.map((c) => c.id));
  const afterIds = new Set(after.map((c) => c.id));
  return {
    added: after.filter((c) => !beforeIds.has(c.id)),
    removed: before.filter((c) => !afterIds.has(c.id)),
    unchanged: after.filter((c) => beforeIds.has(c.id)),
  };
}
