import { beforeAll, describe, expect, it } from "vitest";
import { createViewerSignIn, hashPassword } from "../../server/viewer/signIn";

const GIORGI_PASSWORD = "giorgi's own password";
const MARIAM_PASSWORD = "mariam's own password";
const COOKIE_SECRET = "test-cookie-secret-0123456789abcdef0123456789";
// Real hashes, at a cost low enough for many guesses per test.
const CHEAP = { cost: { N: 2 ** 10, r: 8, p: 1 } };

let env: Record<string, string>;

beforeAll(async () => {
  env = {
    VIEWER_PASSWORD_HASH_GIORGI: await hashPassword(GIORGI_PASSWORD, CHEAP),
    VIEWER_PASSWORD_HASH_MARIAM: await hashPassword(MARIAM_PASSWORD, CHEAP),
    VIEWER_COOKIE_SECRET: COOKIE_SECRET,
  };
});

function fakeClock() {
  let time = Date.UTC(2026, 10, 14, 20, 0, 0);
  return {
    now: () => time,
    advance(ms: number) {
      time += ms;
    },
  };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

const FROM_HOME = { clientAddress: "203.0.113.7", host: "watch.example.com" };

describe("signing in with a password", () => {
  it("identifies each Viewer by their own password", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });

    expect(await viewerSignIn.signIn(GIORGI_PASSWORD, FROM_HOME)).toMatchObject({
      outcome: "signed-in",
      viewer: "giorgi",
    });
    expect(await viewerSignIn.signIn(MARIAM_PASSWORD, FROM_HOME)).toMatchObject({
      outcome: "signed-in",
      viewer: "mariam",
    });
  });

  it("rejects a password that belongs to no Viewer", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });

    for (const password of ["", "wrong password", `${GIORGI_PASSWORD} `, MARIAM_PASSWORD.toUpperCase()]) {
      expect(await viewerSignIn.signIn(password, FROM_HOME)).toMatchObject({
        outcome: "unknown-password",
      });
    }
  });
});

describe("throttling wrong guesses", () => {
  it("lets a few wrong guesses through, then makes that address wait longer after each one", async () => {
    const clock = fakeClock();
    const viewerSignIn = createViewerSignIn({ env, now: clock.now });

    for (let guess = 1; guess <= 4; guess++) {
      expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
        outcome: "unknown-password",
        retryAfterSeconds: 0,
      });
    }
    expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
      outcome: "unknown-password",
      retryAfterSeconds: 1,
    });

    // Too soon: refused without checking the password, even a right one.
    expect(await viewerSignIn.signIn(GIORGI_PASSWORD, FROM_HOME)).toEqual({
      outcome: "too-many-attempts",
      retryAfterSeconds: 1,
    });

    clock.advance(1 * SECOND);
    expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
      outcome: "unknown-password",
      retryAfterSeconds: 2,
    });
    clock.advance(1 * SECOND);
    expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
      outcome: "too-many-attempts",
      retryAfterSeconds: 1,
    });
    clock.advance(1 * SECOND);
    expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
      outcome: "unknown-password",
      retryAfterSeconds: 4,
    });
  });

  async function guessWrongUntilThrottled(
    viewerSignIn: ReturnType<typeof createViewerSignIn>,
    request = FROM_HOME,
  ) {
    for (let guess = 1; guess <= 5; guess++) await viewerSignIn.signIn("wrong", request);
  }

  it("does not hold up other addresses", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    await guessWrongUntilThrottled(viewerSignIn);

    expect(
      await viewerSignIn.signIn(MARIAM_PASSWORD, { ...FROM_HOME, clientAddress: "198.51.100.23" }),
    ).toMatchObject({ outcome: "signed-in", viewer: "mariam" });
  });

  it("forgets an address's wrong guesses once a Viewer signs in from it", async () => {
    const clock = fakeClock();
    const viewerSignIn = createViewerSignIn({ env, now: clock.now });
    await guessWrongUntilThrottled(viewerSignIn);

    clock.advance(1 * SECOND);
    expect(await viewerSignIn.signIn(GIORGI_PASSWORD, FROM_HOME)).toMatchObject({
      outcome: "signed-in",
    });
    for (let guess = 1; guess <= 4; guess++) {
      expect(await viewerSignIn.signIn("typo", FROM_HOME)).toMatchObject({ retryAfterSeconds: 0 });
    }
  });

  it("forgets wrong guesses after an hour without any", async () => {
    const clock = fakeClock();
    const viewerSignIn = createViewerSignIn({ env, now: clock.now });
    await guessWrongUntilThrottled(viewerSignIn);

    clock.advance(60 * MINUTE);
    expect(await viewerSignIn.signIn("wrong", FROM_HOME)).toEqual({
      outcome: "unknown-password",
      retryAfterSeconds: 0,
    });
  });

  it("stops growing the wait at fifteen minutes", async () => {
    const clock = fakeClock();
    const viewerSignIn = createViewerSignIn({ env, now: clock.now });
    await guessWrongUntilThrottled(viewerSignIn);

    const waits: number[] = [];
    for (let guess = 1; guess <= 12; guess++) {
      clock.advance(waits.at(-1) ?? 1 * SECOND);
      const result = await viewerSignIn.signIn("wrong", FROM_HOME);
      if (result.outcome !== "unknown-password") throw new Error(`guess ${guess} was ${result.outcome}`);
      waits.push(result.retryAfterSeconds * SECOND);
    }

    expect(waits.map((wait) => wait / SECOND)).toEqual([
      2, 4, 8, 16, 32, 64, 128, 256, 512, 900, 900, 900,
    ]);
  });

  it("makes every address wait once there are many wrong guesses from many addresses", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    const fromAddress = (n: number) => ({ ...FROM_HOME, clientAddress: `198.51.100.${n}` });

    for (let n = 1; n <= 19; n++) {
      expect(await viewerSignIn.signIn("wrong", fromAddress(n))).toMatchObject({
        retryAfterSeconds: 0,
      });
    }
    expect(await viewerSignIn.signIn("wrong", fromAddress(20))).toEqual({
      outcome: "unknown-password",
      retryAfterSeconds: 1,
    });
    expect(await viewerSignIn.signIn(GIORGI_PASSWORD, fromAddress(21))).toEqual({
      outcome: "too-many-attempts",
      retryAfterSeconds: 1,
    });
  });

  it("throttles a burst of parallel guesses from one address", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => viewerSignIn.signIn("wrong", FROM_HOME)),
    );

    expect(results.filter((result) => result.outcome === "unknown-password")).toHaveLength(5);
    expect(results.filter((result) => result.outcome === "too-many-attempts")).toHaveLength(5);
  });
});

/** What the browser sends back after storing a Set-Cookie header. */
function cookieHeaderFrom(setCookie: string) {
  return setCookie.split(";")[0] ?? "";
}

async function signInAs(
  viewerSignIn: ReturnType<typeof createViewerSignIn>,
  password: string,
  request = FROM_HOME,
) {
  const result = await viewerSignIn.signIn(password, request);
  if (result.outcome !== "signed-in") throw new Error(`expected to sign in, got ${result.outcome}`);
  return result.setCookie;
}

describe("the sign-in cookie", () => {
  it("tells the server which Viewer sent a later request", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    const giorgiCookie = await signInAs(viewerSignIn, GIORGI_PASSWORD);
    const mariamCookie = await signInAs(viewerSignIn, MARIAM_PASSWORD);

    expect(viewerSignIn.readViewer(cookieHeaderFrom(giorgiCookie))).toBe("giorgi");
    expect(viewerSignIn.readViewer(cookieHeaderFrom(mariamCookie))).toBe("mariam");
    expect(viewerSignIn.readViewer(`theme=dark; ${cookieHeaderFrom(mariamCookie)}; lang=ka`)).toBe(
      "mariam",
    );
  });

  it("lasts a year, is hidden from page scripts and is only sent over HTTPS", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    const setCookie = await signInAs(viewerSignIn, GIORGI_PASSWORD);
    const attributes = setCookie.split("; ").slice(1);

    expect(attributes).toEqual(
      expect.arrayContaining(["Max-Age=31536000", "Path=/", "HttpOnly", "SameSite=Lax", "Secure"]),
    );
  });

  it("is not marked Secure on localhost, where development runs over plain HTTP", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });

    for (const host of ["localhost:3000", "localhost", "127.0.0.1:3000", "[::1]:3000"]) {
      const setCookie = await signInAs(viewerSignIn, GIORGI_PASSWORD, { ...FROM_HOME, host });
      expect(setCookie.split("; ")).not.toContain("Secure");
    }
  });

  it("stops working when someone edits it", async () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    const giorgiCookie = cookieHeaderFrom(await signInAs(viewerSignIn, GIORGI_PASSWORD));
    const [name = "", value = ""] = giorgiCookie.split("=");
    const [viewer = "", version = "", issuedAt = "", signature = ""] = value.split(".");
    const flipLastCharacter = (text: string) => text.slice(0, -1) + (text.endsWith("A") ? "B" : "A");

    const edited = [
      [`mariam`, version, issuedAt, signature],
      [viewer, flipLastCharacter(version), issuedAt, signature],
      [viewer, version, String(Number(issuedAt) + 3600), signature],
      [viewer, version, issuedAt, flipLastCharacter(signature)],
      [viewer, version, issuedAt],
      [viewer, version, issuedAt, signature, signature],
    ];
    for (const parts of edited) {
      expect(viewerSignIn.readViewer(`${name}=${parts.join(".")}`)).toBeNull();
    }
    expect(viewerSignIn.readViewer(`${name}=giorgi`)).toBeNull();
  });

  it("is not accepted by a server that signs cookies with a different secret", async () => {
    const issuer = createViewerSignIn({ env, now: fakeClock().now });
    const otherServer = createViewerSignIn({
      env: { ...env, VIEWER_COOKIE_SECRET: `${COOKIE_SECRET}-rotated` },
      now: fakeClock().now,
    });
    const giorgiCookie = cookieHeaderFrom(await signInAs(issuer, GIORGI_PASSWORD));

    expect(otherServer.readViewer(giorgiCookie)).toBeNull();
  });

  it("expires a year after signing in", async () => {
    const clock = fakeClock();
    const viewerSignIn = createViewerSignIn({ env, now: clock.now });
    const giorgiCookie = cookieHeaderFrom(await signInAs(viewerSignIn, GIORGI_PASSWORD));

    clock.advance(364 * DAY);
    expect(viewerSignIn.readViewer(giorgiCookie)).toBe("giorgi");

    clock.advance(1 * DAY);
    expect(viewerSignIn.readViewer(giorgiCookie)).toBeNull();
  });

  it("stops working for one Viewer when the operator changes that Viewer's password", async () => {
    const before = createViewerSignIn({ env, now: fakeClock().now });
    const giorgiCookie = cookieHeaderFrom(await signInAs(before, GIORGI_PASSWORD));
    const mariamCookie = cookieHeaderFrom(await signInAs(before, MARIAM_PASSWORD));

    const after = createViewerSignIn({
      env: { ...env, VIEWER_PASSWORD_HASH_GIORGI: await hashPassword("giorgi's new password", CHEAP) },
      now: fakeClock().now,
    });

    expect(after.readViewer(giorgiCookie)).toBeNull();
    expect(after.readViewer(mariamCookie)).toBe("mariam");
  });

  it("is deleted from the browser on sign-out", () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });
    const setCookie = viewerSignIn.signOut(FROM_HOME);

    expect(setCookie.startsWith("watch_viewer=;")).toBe(true);
    expect(setCookie.split("; ")).toEqual(
      expect.arrayContaining(["Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax", "Secure"]),
    );
  });

  it("is missing from requests by signed-out visitors", () => {
    const viewerSignIn = createViewerSignIn({ env, now: fakeClock().now });

    expect(viewerSignIn.readViewer(undefined)).toBeNull();
    expect(viewerSignIn.readViewer(null)).toBeNull();
    expect(viewerSignIn.readViewer("")).toBeNull();
    expect(viewerSignIn.readViewer("theme=dark")).toBeNull();
  });
});

describe("the startup check", () => {
  const start = (overrides: Record<string, string | undefined>) => () =>
    createViewerSignIn({ env: { ...env, ...overrides }, now: fakeClock().now });

  it("starts with a password hash for each Viewer and a cookie secret", () => {
    expect(start({})).not.toThrow();
  });

  it("refuses to start when a Viewer's password hash is missing", () => {
    for (const variable of ["VIEWER_PASSWORD_HASH_GIORGI", "VIEWER_PASSWORD_HASH_MARIAM"]) {
      expect(start({ [variable]: undefined })).toThrow(variable);
      expect(start({ [variable]: "" })).toThrow(variable);
    }
  });

  it("refuses to start when a password hash is not one the hash script printed", () => {
    expect(start({ VIEWER_PASSWORD_HASH_MARIAM: MARIAM_PASSWORD })).toThrow(
      "VIEWER_PASSWORD_HASH_MARIAM",
    );
    expect(start({ VIEWER_PASSWORD_HASH_MARIAM: "scrypt:1000:8:1:c2FsdA:a2V5" })).toThrow(
      "VIEWER_PASSWORD_HASH_MARIAM",
    );
  });

  it("refuses to start when the cookie secret is missing or too short to be secret", () => {
    expect(start({ VIEWER_COOKIE_SECRET: undefined })).toThrow("VIEWER_COOKIE_SECRET");
    expect(start({ VIEWER_COOKIE_SECRET: "" })).toThrow("VIEWER_COOKIE_SECRET");
    expect(start({ VIEWER_COOKIE_SECRET: "hunter2" })).toThrow("VIEWER_COOKIE_SECRET");
  });

  it("refuses to start when both Viewers have the same password hash", () => {
    expect(start({ VIEWER_PASSWORD_HASH_MARIAM: env.VIEWER_PASSWORD_HASH_GIORGI })).toThrow(
      /same password/,
    );
  });

  it("refuses to sign anyone in when one password verifies both Viewers' hashes", async () => {
    // Hashed separately, so the salts differ and only a sign-in can tell.
    const viewerSignIn = createViewerSignIn({
      env: { ...env, VIEWER_PASSWORD_HASH_MARIAM: await hashPassword(GIORGI_PASSWORD, CHEAP) },
      now: fakeClock().now,
    });

    await expect(viewerSignIn.signIn(GIORGI_PASSWORD, FROM_HOME)).rejects.toThrow(/same password/);
  });
});
