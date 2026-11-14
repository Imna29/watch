import { describe, expect, it } from "vitest";
import { SIGNED_OUT_HEADER, lostSignIn } from "../../utils/signIn";

/** A response as the site's API client sees it. */
function response(status: number, headers: Record<string, string> = {}) {
  return { status, headers: new Headers(headers) };
}

const FROM_THE_GUARD = { [SIGNED_OUT_HEADER]: "1" };

describe("a response that means the sign-in cookie stopped working", () => {
  it("is the server guard's 401", () => {
    expect(lostSignIn("/api/playlists", response(401, FROM_THE_GUARD))).toBe(true);
    expect(lostSignIn("/api/watch/movie/438631", response(401, FROM_THE_GUARD))).toBe(true);
  });

  it("is not a 401 the guard did not send, such as TMDB's refusing the site's API key", () => {
    expect(lostSignIn("/api/watch/movie/438631", response(401))).toBe(false);
  });

  it("is not any other failure", () => {
    for (const status of [400, 403, 404, 429, 500, 502]) {
      expect(lostSignIn("/api/watch/movie/438631", response(status, FROM_THE_GUARD))).toBe(false);
    }
  });

  it("is not the answer to the sign-in requests themselves, which expect a 401", () => {
    for (const path of ["/api/sign-in", "/api/sign-out", "/api/viewer"]) {
      expect(lostSignIn(path, response(401, FROM_THE_GUARD))).toBe(false);
    }
  });
});
