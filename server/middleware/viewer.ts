// The server-wide guard (ADR 0001): every API request needs a signed-in
// Viewer, except the sign-in request itself. Pages are a client-rendered
// shell; the client route guard sends signed-out visitors to /sign-in.
// WebSocket upgrades do not pass through Nitro middleware, so a WebSocket
// handler checks the upgrade request's cookie itself (see `useViewerSignIn`).
import { API_BASE, SIGN_IN_REQUESTS } from "~/utils/signIn";

export default defineEventHandler((event) => {
  const path = normalizedPath(event.path);
  const isApi = path === API_BASE || path.startsWith(`${API_BASE}/`);
  if (!isApi || path === `${API_BASE}${SIGN_IN_REQUESTS.signIn}`) return;

  event.context.viewer = requireViewer(event);
});

// Lower-cased, percent-decoded and without a trailing slash, so no spelling
// of an API path slips past the guard.
function normalizedPath(path: string) {
  const [pathname = ""] = path.split("?");
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes: judge the raw path.
  }
  return decoded.toLowerCase().replace(/\/+$/, "");
}
