export function hasPrefix(prefix: string, name: string): boolean {
  return name.startsWith(`${prefix} `);
}

export function formatPlaylistName(prefix: string, name: string): string {
  if (hasPrefix(prefix, name)) return name;
  return `${prefix} ${name}`;
}

export function parsePlaylistName(
  prefix: string,
  fullName: string,
): { name: string; hasPrefix: boolean } {
  if (hasPrefix(prefix, fullName)) {
    return { name: fullName.slice(prefix.length + 1), hasPrefix: true };
  }
  return { name: fullName, hasPrefix: false };
}
