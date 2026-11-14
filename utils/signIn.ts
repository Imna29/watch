/** The only page signed-out visitors can see (middleware/viewer.global.ts). */
export const SIGN_IN_PATH = "/sign-in";

const HOME_PATH = "/watch";

/**
 * Where to go after signing in: the page the visitor asked for, when it is a
 * path on this site, else home. Never another origin (`//evil.example`).
 */
export function pathAfterSignIn(redirect: unknown): string {
  if (typeof redirect !== "string" || !redirect.startsWith("/")) return HOME_PATH;
  if (redirect.startsWith("//") || redirect.startsWith("/\\")) return HOME_PATH;
  if (redirect === SIGN_IN_PATH || redirect.startsWith(`${SIGN_IN_PATH}?`)) return HOME_PATH;
  return redirect;
}

/**
 * The header the server's sign-in guard (`requireViewer`) sets on its 401:
 * the request had no valid sign-in cookie. Other 401s do not have it.
 */
export const SIGNED_OUT_HEADER = "x-watch-signed-out";

// Answered 401 on purpose: a wrong password, or "nobody signed in" while the
// route guard asks who is.
const SIGN_IN_REQUESTS = ["/sign-in", "/sign-out", "/viewer"];

/**
 * Whether the API's `response` to a request for `path` says the sign-in
 * cookie stopped working (expired, or this Viewer's password changed), so
 * the page starts over from the sign-in page. Only the guard's 401 says so:
 * not a 401 from anything else, and not the sign-in requests' own.
 */
export function lostSignIn(path: string, response: { status: number; headers: Headers }): boolean {
  if (response.status !== 401 || response.headers.get(SIGNED_OUT_HEADER) === null) return false;
  return !SIGN_IN_REQUESTS.some((signInRequest) => path.endsWith(signInRequest));
}

/** The sign-in page, remembering `fromPath` to come back to afterwards. */
export function signInPathFrom(fromPath: string): string {
  const back = pathAfterSignIn(fromPath);
  return back === HOME_PATH ? SIGN_IN_PATH : `${SIGN_IN_PATH}?redirect=${encodeURIComponent(back)}`;
}
