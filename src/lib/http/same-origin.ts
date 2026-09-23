// Browsers tag every request with Sec-Fetch-Site. A paid or destructive action
// has to come from one of our own pages ("same-origin"), because every other
// value is something the user did not deliberately ask this app to do:
//
//   cross-site / same-site  another website or port, e.g. a hidden form post
//   none                    a direct navigation — a typed URL, a bookmark, a
//                           link opened in a new tab
//
// `none` used to be allowed so a run could be kicked off by hand. But classify
// and propose are GETs, so the address bar fires them for real, and propose
// deletes every category and assignment before spending money on new ones.
// Pasting a URL to "just check it" is not consent to that.
//
// Requests with no header at all (curl, scripts, tests) are still allowed:
// those take deliberate effort, and the test suite depends on it.
export function rejectUnlessFromApp(req: Request): Response | null {
  const site = req.headers.get("sec-fetch-site");
  if (site === null || site === "same-origin") return null;
  return new Response("Request must come from the app", { status: 403 });
}
