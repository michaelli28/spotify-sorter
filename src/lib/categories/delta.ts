export interface CategoryRef {
  id: string;
  name: string;
}

export interface CategoryDeltaResult<
  B extends CategoryRef = CategoryRef,
  A extends CategoryRef = CategoryRef,
> {
  added: A[];
  removed: B[];
  unchanged: A[];
}

export function categoryDelta<B extends CategoryRef, A extends CategoryRef>(
  before: readonly B[],
  after: readonly A[],
): CategoryDeltaResult<B, A> {
  const beforeIds = new Set(before.map((c) => c.id));
  const afterIds = new Set(after.map((c) => c.id));
  return {
    added: after.filter((c) => !beforeIds.has(c.id)),
    removed: before.filter((c) => !afterIds.has(c.id)),
    unchanged: after.filter((c) => beforeIds.has(c.id)),
  };
}
