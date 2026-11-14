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

/** The sign-in page, remembering `fromPath` to come back to afterwards. */
export function signInPathFrom(fromPath: string): string {
  const back = pathAfterSignIn(fromPath);
  return back === HOME_PATH ? SIGN_IN_PATH : `${SIGN_IN_PATH}?redirect=${encodeURIComponent(back)}`;
}
