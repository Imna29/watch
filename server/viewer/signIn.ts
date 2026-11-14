import { createHmac, timingSafeEqual } from "node:crypto";
import { VIEWER_NAMES, VIEWERS, isViewer, type Viewer } from "../../models/Viewer";
import { createFailureThrottle, type ThrottlePolicy } from "./failureThrottle";
import { parsePasswordHash, verifyPassword, type PasswordHash } from "./passwordHash";

export { hashPassword } from "./passwordHash";

export const SIGN_IN_COOKIE_NAME = "watch_viewer";
const COOKIE_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

const MINUTE = 60 * 1000;
// Wrong guesses from one client address: five free, then 1s, 2s, 4s, ... up to 15 minutes.
const PER_ADDRESS_THROTTLE: ThrottlePolicy = {
  freeFailures: 5,
  firstDelayMs: 1000,
  maxDelayMs: 15 * MINUTE,
  forgetAfterMs: 60 * MINUTE,
};
// Wrong guesses from all addresses together, against guessing from many addresses.
const GLOBAL_THROTTLE: ThrottlePolicy = {
  freeFailures: 20,
  firstDelayMs: 1000,
  maxDelayMs: 15 * MINUTE,
  forgetAfterMs: 60 * MINUTE,
};
const GLOBAL = "global";

export interface ViewerSignInOptions {
  /** Server config, usually `process.env`. */
  env: Record<string, string | undefined>;
  /** Milliseconds since the epoch. Injected so tests can move time. */
  now?: () => number;
  /** Where a configuration problem found while signing in is reported; `console.error` by default. */
  logError?: (message: string) => void;
}

export interface SignInRequest {
  /** The client's IP address, or undefined when it is unknown. */
  clientAddress: string | undefined;
  /** The request's Host header. */
  host: string | undefined;
}

export type SignInResult =
  | { outcome: "signed-in"; viewer: Viewer; setCookie: string }
  /** `retryAfterSeconds` is how long the next attempt must wait (0: no wait). */
  | { outcome: "unknown-password"; retryAfterSeconds: number }
  /** Refused without checking the password. */
  | { outcome: "too-many-attempts"; retryAfterSeconds: number }
  /** The password is both Viewers': the config cannot tell them apart, so nobody is signed in (it is logged). */
  | { outcome: "misconfigured" };

/**
 * Creates the Viewer sign-in for one server process. Throws, so the server
 * refuses to start, when the config cannot tell the two Viewers apart.
 */
export function createViewerSignIn({ env, now = Date.now, logError = console.error }: ViewerSignInOptions) {
  const { cookieSecret, passwordHashes } = readConfig(env);
  // Derived from each Viewer's password hash, so a new hash for one Viewer
  // invalidates only that Viewer's cookies.
  const credentialVersions = Object.fromEntries(
    passwordHashes.map(([viewer, hash]) => [viewer, credentialVersion(hash)]),
  ) as Record<Viewer, string>;

  function hmac(purpose: string, data: string | Buffer) {
    return createHmac("sha256", cookieSecret).update(`${purpose}\0`).update(data).digest("base64url");
  }

  function credentialVersion(hash: PasswordHash) {
    return hmac("credential-version", Buffer.concat([hash.salt, hash.key])).slice(0, 16);
  }

  /** The Viewer whose password this is; "both" when it is both Viewers'. */
  async function identify(password: string): Promise<Viewer | "both" | null> {
    // Always check both hashes, so timing does not reveal which one matched.
    const matches = await Promise.all(
      passwordHashes.map(([, hash]) => verifyPassword(password, hash)),
    );
    if (matches.every(Boolean)) return "both";
    return passwordHashes[matches.indexOf(true)]?.[0] ?? null;
  }

  const perAddress = createFailureThrottle(PER_ADDRESS_THROTTLE, now);
  const global = createFailureThrottle(GLOBAL_THROTTLE, now);

  function retryAfterSeconds(addressKey: string) {
    return Math.ceil(Math.max(perAddress.waitMs(addressKey), global.waitMs(GLOBAL)) / 1000);
  }

  function cookieValueFor(viewer: Viewer) {
    const payload = `${viewer}.${credentialVersions[viewer]}.${Math.floor(now() / 1000)}`;
    return `${payload}.${hmac("sign-in-cookie", payload)}`;
  }

  return {
    async signIn(password: string, request: SignInRequest): Promise<SignInResult> {
      const addressKey = `address:${request.clientAddress ?? "unknown"}`;
      const wait = retryAfterSeconds(addressKey);
      if (wait > 0) return { outcome: "too-many-attempts", retryAfterSeconds: wait };

      // Counted as a failure before the (slow) check, so a burst of parallel
      // guesses is throttled too; taken back if the password is right.
      perAddress.fail(addressKey);
      global.fail(GLOBAL);
      const viewer = await identify(password);
      if (viewer === "both") {
        // Separately hashed copies of one password have different salts, so
        // only a sign-in with that password can notice.
        const variables = VIEWERS.map(passwordHashVariable).join(" and ");
        logError(
          `Viewer sign-in is misconfigured: ${SAME_PASSWORD_PROBLEM} A password verified against both ${variables}, so nobody was signed in. Hash a new password for one of them with \`bun run hash-password --viewer <name>\`.`,
        );
        return { outcome: "misconfigured" };
      }
      if (!viewer) {
        return { outcome: "unknown-password", retryAfterSeconds: retryAfterSeconds(addressKey) };
      }
      perAddress.clear(addressKey);
      global.forgive(GLOBAL);
      return {
        outcome: "signed-in",
        viewer,
        setCookie: setCookieHeader(cookieValueFor(viewer), COOKIE_LIFETIME_SECONDS, request.host),
      };
    },

    /**
     * The signed-in Viewer, read from a request's `Cookie` header, or null when
     * the cookie is missing or not valid. Works for any request, including a
     * WebSocket upgrade.
     */
    readViewer(cookieHeader: string | null | undefined): Viewer | null {
      const value = readCookie(cookieHeader, SIGN_IN_COOKIE_NAME);
      if (!value) return null;
      const [viewer, version, issuedAt, signature, ...rest] = value.split(".");
      if (rest.length > 0 || !isViewer(viewer) || !version || !issuedAt || !signature) return null;
      const expected = hmac("sign-in-cookie", `${viewer}.${version}.${issuedAt}`);
      if (!safeEqual(signature, expected)) return null;
      if (version !== credentialVersions[viewer]) return null;
      const issuedAtSeconds = /^\d+$/.test(issuedAt) ? Number(issuedAt) : NaN;
      if (!(now() / 1000 < issuedAtSeconds + COOKIE_LIFETIME_SECONDS)) return null;
      return viewer;
    },

    /** The `Set-Cookie` header that deletes the sign-in cookie. */
    signOut(request: Pick<SignInRequest, "host">): string {
      return setCookieHeader("", 0, request.host);
    },
  };
}

export function passwordHashVariable(viewer: Viewer) {
  return `VIEWER_PASSWORD_HASH_${viewer.toUpperCase()}`;
}

export interface NewPasswordCheck {
  /** The Viewer the new password is for; null when the operator did not say. */
  viewer: Viewer | null;
  /** Server config, usually `process.env`: the Viewers' password hashes in it are checked. */
  env: Record<string, string | undefined>;
  /** The other Viewer's password hash, given on the command line (`--other-hash`). */
  otherHash?: string;
}

/**
 * Why `password` must not become `viewer`'s password, for `bun run
 * hash-password`: it is already the other Viewer's, by their hash in the
 * config or on the command line, so a password could not tell the two
 * apart. Null when no hash at hand says so. The server cannot tell from the
 * hashes alone (each has its own salt): only a password can.
 */
export async function samePasswordProblem(
  password: string,
  { viewer, env, otherHash }: NewPasswordCheck,
): Promise<string | null> {
  if (otherHash !== undefined) {
    const hash = parsePasswordHash(otherHash);
    if (!hash) return "--other-hash is not a password hash printed by `bun run hash-password`.";
    if (await verifyPassword(password, hash)) {
      return "That password is already the other Viewer's. Each Viewer needs their own password.";
    }
  }
  for (const owner of VIEWERS) {
    if (owner === viewer) continue;
    const hash = parsePasswordHash(env[passwordHashVariable(owner)]?.trim() ?? "");
    if (!hash || !(await verifyPassword(password, hash))) continue;
    const again = viewer === null ? ` Hashing ${VIEWER_NAMES[owner]}'s own password again? Add \`--viewer ${owner}\`.` : "";
    return `That password is already ${VIEWER_NAMES[owner]}'s (${passwordHashVariable(owner)}). Each Viewer needs their own password.${again}`;
  }
  return null;
}

const COOKIE_SECRET_VARIABLE = "VIEWER_COOKIE_SECRET";
const MIN_COOKIE_SECRET_LENGTH = 32;
const SAME_PASSWORD_PROBLEM =
  "Giorgi and Mariam have the same password, so a password cannot tell them apart.";

function readConfig(env: Record<string, string | undefined>) {
  const problems: string[] = [];

  const passwordHashes: (readonly [Viewer, PasswordHash])[] = [];
  for (const viewer of VIEWERS) {
    const variable = passwordHashVariable(viewer);
    const text = env[variable]?.trim();
    const hash = text ? parsePasswordHash(text) : null;
    if (!text) {
      problems.push(`${variable} is not set. Set it to the hash \`bun run hash-password\` prints.`);
    } else if (!hash) {
      problems.push(`${variable} is not a password hash printed by \`bun run hash-password\`.`);
    } else {
      passwordHashes.push([viewer, hash]);
    }
  }

  const [first, second] = passwordHashes.map(([, hash]) => hash);
  if (first && second && first.salt.equals(second.salt) && first.key.equals(second.key)) {
    problems.push(`${SAME_PASSWORD_PROBLEM} Each Viewer needs their own password hash.`);
  }

  const cookieSecret = env[COOKIE_SECRET_VARIABLE] ?? "";
  if (cookieSecret.length < MIN_COOKIE_SECRET_LENGTH) {
    problems.push(
      `${COOKIE_SECRET_VARIABLE} must be a random string of at least ${MIN_COOKIE_SECRET_LENGTH} characters, e.g. from \`openssl rand -base64 32\`.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Viewer sign-in is not configured:\n- ${problems.join("\n- ")}`);
  }
  return { cookieSecret, passwordHashes };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(cookieHeader: string | null | undefined, name: string) {
  for (const pair of (cookieHeader ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

function setCookieHeader(value: string, maxAgeSeconds: number, host: string | undefined) {
  const attributes = [
    `${SIGN_IN_COOKIE_NAME}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (!isLocalhost(host)) attributes.push("Secure");
  return attributes.join("; ");
}

function isLocalhost(host: string | undefined) {
  const hostname = (host ?? "").replace(/:\d+$/, "").toLowerCase();
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}
