import { createHash } from "node:crypto";

export interface CategoryDefinition {
  id: string;
  name: string;
  definition: string;
}

export class DefinitionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionsError";
  }
}

const HEADING = /^## (.*)$/;

// definitions.md: text before the first `## ` heading is an intro; each
// `## <exact category name>` owns the text up to the next `## ` heading.
export function parseDefinitions(
  markdown: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): CategoryDefinition[] {
  const sections = new Map<string, string[]>();
  const duplicates: string[] = [];
  let current: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (!heading) {
      current?.push(line);
      continue;
    }
    const name = heading[1]!.trim();
    if (sections.has(name)) duplicates.push(name);
    current = [];
    sections.set(name, current);
  }

  const known = new Set(categories.map((c) => c.name));
  const missing = categories.filter((c) => !sections.has(c.name));
  const unknown = [...sections.keys()].filter((name) => !known.has(name));
  const problems = [
    missing.length > 0 &&
      `missing categories: ${quoted(missing.map((c) => c.name))}`,
    unknown.length > 0 && `unknown headings: ${quoted(unknown)}`,
    duplicates.length > 0 && `duplicate headings: ${quoted(duplicates)}`,
  ].filter((p): p is string => typeof p === "string");
  if (problems.length > 0) {
    throw new DefinitionsError(
      `definitions.md doesn't match the categories. ${problems.join("; ")}`,
    );
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    definition: sections.get(c.name)!.join("\n").trim(),
  }));
}

function quoted(names: string[]): string {
  return names.map((n) => JSON.stringify(n)).join(", ");
}

export function definitionsSha256(markdown: string): string {
  return createHash("sha256").update(markdown, "utf-8").digest("hex");
}
