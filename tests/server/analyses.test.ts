import { describe, expect, it } from "vitest";
import { createAnalyses } from "../../server/analyses/analyses";
import { createMemoryAnalysisStore } from "../../server/analyses/memoryStore";

function fakeClock() {
  let time = Date.UTC(2026, 10, 14, 20, 0, 0);
  return {
    now: () => time,
    advance(ms: number) {
      time += ms;
    },
  };
}

const MINUTE = 60 * 1000;

const FIGHT_CLUB = 550;
const MEMENTO = 77;

function setUp() {
  const clock = fakeClock();
  const analyses = createAnalyses({ store: createMemoryAnalysisStore(), now: clock.now });
  return { clock, analyses };
}

describe("writing an Analysis", () => {
  it("lets the writer submit one that both Viewers then read", async () => {
    const { analyses } = setUp();
    const text = "Tyler is the narrator.\n\nThe ending is a breakdown, not a victory.";

    expect(await analyses.write("giorgi", FIGHT_CLUB, text)).toEqual({
      outcome: "written",
      analysis: {
        movieId: FIGHT_CLUB,
        text,
        submittedAt: new Date("2026-11-14T20:00:00Z"),
        editedAt: new Date("2026-11-14T20:00:00Z"),
      },
    });

    for (const viewer of ["giorgi", "mariam"] as const) {
      expect(await analyses.forMovie(viewer, FIGHT_CLUB)).toMatchObject({ movieId: FIGHT_CLUB, text });
    }
  });

  it("replaces the text when written again, keeping one Analysis for the movie", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "First draft.");
    clock.advance(5 * MINUTE);

    expect(await analyses.write("giorgi", FIGHT_CLUB, "Second thoughts.")).toEqual({
      outcome: "written",
      analysis: {
        movieId: FIGHT_CLUB,
        text: "Second thoughts.",
        submittedAt: new Date("2026-11-14T20:00:00Z"),
        editedAt: new Date("2026-11-14T20:05:00Z"),
      },
    });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toEqual({
      movieId: FIGHT_CLUB,
      text: "Second thoughts.",
      submittedAt: new Date("2026-11-14T20:00:00Z"),
      editedAt: new Date("2026-11-14T20:05:00Z"),
    });
  });

  it("keeps each movie's Analysis apart", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "About Fight Club.");
    await analyses.write("giorgi", MEMENTO, "About Memento.");

    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toMatchObject({ text: "About Fight Club." });
    expect(await analyses.forMovie("mariam", MEMENTO)).toMatchObject({ text: "About Memento." });
  });

  it("refuses anyone but the writer, and keeps nothing", async () => {
    const { analyses } = setUp();

    expect(await analyses.write("mariam", FIGHT_CLUB, "My own reading.")).toEqual({
      outcome: "wrong-viewer",
    });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toBeNull();
  });

  it("refuses the grader's rewrite of the writer's text", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Giorgi's reading.");

    expect(await analyses.write("mariam", FIGHT_CLUB, "Mariam's reading.")).toEqual({
      outcome: "wrong-viewer",
    });
    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toMatchObject({ text: "Giorgi's reading." });
  });
});

describe("reading a movie's Analysis", () => {
  it("returns none for a movie without one", async () => {
    const { analyses } = setUp();

    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toBeNull();
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toBeNull();
  });
});
