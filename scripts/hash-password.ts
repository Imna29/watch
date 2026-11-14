// Prints the hash of a Viewer's password, ready to paste into server config
// as VIEWER_PASSWORD_HASH_GIORGI or VIEWER_PASSWORD_HASH_MARIAM (ADR 0001).
//
//   bun run hash-password                         asks for the password twice, hidden
//   printf %s "$PASSWORD" | bun run hash-password  reads it from stdin
//
// The password is never taken as an argument, so it stays out of shell history.
//
// It refuses the other Viewer's password, when it has their hash: from the
// environment (VIEWER_PASSWORD_HASH_GIORGI / _MARIAM; bun loads `.env`), or
// from `--other-hash <hash>`. `--viewer giorgi|mariam` says whose password
// it is, so hashing a Viewer's own password again is not refused.
import { isViewer, type Viewer } from "../models/Viewer";
import { hashPassword } from "../server/viewer/passwordHash";
import { samePasswordProblem } from "../server/viewer/signIn";

const MIN_LENGTH = 8;

function readArguments(args: string[]): { viewer: Viewer | null; otherHash?: string } {
  let viewer: Viewer | null = null;
  let otherHash: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const [name, value] = [args[i], args[i + 1]];
    if (name === "--viewer" && isViewer(value)) viewer = value;
    else if (name === "--other-hash" && value) otherHash = value;
    else throw new Error("Usage: bun run hash-password [--viewer giorgi|mariam] [--other-hash <hash>]");
    i += 1;
  }
  return { viewer, otherHash };
}

async function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003" || char === "\u0004") {
          finish();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readPiped();
  const password = await readHidden("Password: ");
  const again = await readHidden("Same password again: ");
  if (password !== again) throw new Error("The two passwords differ.");
  return password;
}

try {
  const { viewer, otherHash } = readArguments(process.argv.slice(2));
  const password = await readPassword();
  if (Array.from(password).length < MIN_LENGTH) {
    throw new Error(`Use at least ${MIN_LENGTH} characters.`);
  }
  const problem = await samePasswordProblem(password, { viewer, env: process.env, otherHash });
  if (problem) throw new Error(problem);
  console.log(await hashPassword(password));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
