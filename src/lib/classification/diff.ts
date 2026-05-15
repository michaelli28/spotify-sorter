export interface TrackDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export function diffTracks(previous: string[], current: string[]): TrackDiff {
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  return {
    added: current.filter((id) => !prevSet.has(id)),
    removed: previous.filter((id) => !currSet.has(id)),
    unchanged: current.filter((id) => prevSet.has(id)),
  };
}
