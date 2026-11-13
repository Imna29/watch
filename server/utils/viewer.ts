import type { H3Event } from "h3";
import type { Viewer } from "~/models/Viewer";
import { createViewerSignIn } from "../viewer/signIn";

declare module "h3" {
  interface H3EventContext {
    /** Set by `server/middleware/viewer.ts` for every signed-in API request. */
    viewer?: Viewer;
  }
}

let viewerSignIn: ReturnType<typeof createViewerSignIn> | undefined;

/**
 * The process-wide Viewer sign-in, created from server config on first use
 * (`server/plugins/viewer-sign-in.ts` creates it at startup).
 *
 * For a WebSocket upgrade, read the Viewer from the upgrade request's cookie:
 * `useViewerSignIn().readViewer(request.headers.get("cookie"))`.
 */
export function useViewerSignIn() {
  viewerSignIn ??= createViewerSignIn({ env: process.env });
  return viewerSignIn;
}

/** The Viewer who sent this request, or null when it has no valid sign-in cookie. */
export function getRequestViewer(event: H3Event): Viewer | null {
  return event.context.viewer ?? useViewerSignIn().readViewer(getRequestHeader(event, "cookie"));
}

/** The Viewer who sent this request; responds 401 when it has no valid sign-in cookie. */
export function requireViewer(event: H3Event): Viewer {
  const viewer = getRequestViewer(event);
  if (!viewer) {
    throw createError({ statusCode: 401, statusMessage: "Sign in first" });
  }
  return viewer;
}
