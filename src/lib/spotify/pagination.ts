export interface PaginatorOpts {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

interface Page<T> {
  items: T[];
  next: string | null;
}

export async function paginate<T>(
  firstUrl: string,
  opts: PaginatorOpts,
): Promise<T[]> {
  const f = opts.fetchImpl ?? fetch;
  const out: T[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const r: Response = await f(url, {
      headers: { authorization: `Bearer ${opts.accessToken}` },
    });
    if (!r.ok)
      throw new Error(`Spotify ${r.status} on ${url}: ${await r.text()}`);
    const page = (await r.json()) as Page<T>;
    out.push(...page.items);
    url = page.next;
  }
  return out;
}
