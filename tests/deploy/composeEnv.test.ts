import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The variables `docker compose` interpolates into compose.yaml (`$$VAR` is the container's own). */
function variablesReadBy(composeFile: string) {
  const names = [...composeFile.matchAll(/(?<!\$)\$\{([A-Z_][A-Z0-9_]*)/g)].map((match) => match[1]);
  return [...new Set(names)].sort();
}

/** The variables .env.example lists, set (`VAR=`) or optional and commented out (`# VAR=`). */
function variablesListedIn(envExample: string) {
  return new Set([...envExample.matchAll(/^#?\s*([A-Z_][A-Z0-9_]*)=/gm)].map((match) => match[1]));
}

describe("the self-hosted stack's settings", () => {
  it("lists every variable compose.yaml reads in .env.example", () => {
    const listed = variablesListedIn(repoFile(".env.example"));
    const needed = variablesReadBy(repoFile("compose.yaml"));

    expect(needed).toContain("DOMAIN");
    expect(needed.filter((name) => !listed.has(name))).toEqual([]);
  });
});
