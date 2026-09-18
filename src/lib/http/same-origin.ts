// Browsers tag every request with Sec-Fetch-Site. Anything other than our own
// pages ("same-origin") or a typed URL ("none") means another website or port
// triggered it, e.g. a hidden form post that starts a paid classify run or
// writes playlists. Requests without the header (curl, tests) are allowed.
export function rejectCrossSite(req: Request): Response | null {
  const site = req.headers.get("sec-fetch-site");
  if (site === null || site === "same-origin" || site === "none") return null;
  return new Response("Cross-site request blocked", { status: 403 });
}
