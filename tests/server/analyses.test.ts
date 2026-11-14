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
        grade: null,
        remark: null,
        gradedAt: null,
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
        grade: null,
        remark: null,
        gradedAt: null,
      },
    });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toEqual({
      movieId: FIGHT_CLUB,
      text: "Second thoughts.",
      submittedAt: new Date("2026-11-14T20:00:00Z"),
      editedAt: new Date("2026-11-14T20:05:00Z"),
      grade: null,
      remark: null,
      gradedAt: null,
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

describe("grading an Analysis", () => {
  it("lets the grader grade one, and both Viewers then read the Grade and remark", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");
    clock.advance(30 * MINUTE);

    expect(await analyses.grade("mariam", FIGHT_CLUB, 8, "You missed the IKEA catalogue.")).toEqual({
      outcome: "graded",
      analysis: {
        movieId: FIGHT_CLUB,
        text: "Tyler is the narrator.",
        submittedAt: new Date("2026-11-14T20:00:00Z"),
        editedAt: new Date("2026-11-14T20:00:00Z"),
        grade: 8,
        remark: "You missed the IKEA catalogue.",
        gradedAt: new Date("2026-11-14T20:30:00Z"),
      },
    });

    for (const viewer of ["giorgi", "mariam"] as const) {
      expect(await analyses.forMovie(viewer, FIGHT_CLUB)).toMatchObject({
        grade: 8,
        remark: "You missed the IKEA catalogue.",
        gradedAt: new Date("2026-11-14T20:30:00Z"),
      });
    }
  });

  it("refuses anyone but the grader, and leaves the Analysis ungraded", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");

    expect(await analyses.grade("giorgi", FIGHT_CLUB, 10, "Nailed it.")).toEqual({
      outcome: "wrong-viewer",
    });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toMatchObject({
      grade: null,
      remark: null,
      gradedAt: null,
    });
  });

  it("lets the grader regrade, replacing the Grade and remark", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");
    await analyses.grade("mariam", FIGHT_CLUB, 4, "Too short.");
    clock.advance(MINUTE);

    expect(await analyses.grade("mariam", FIGHT_CLUB, 6, "On second thought, fair.")).toMatchObject({
      outcome: "graded",
      analysis: { grade: 6, remark: "On second thought, fair.", gradedAt: new Date("2026-11-14T20:01:00Z") },
    });
    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toMatchObject({
      grade: 6,
      remark: "On second thought, fair.",
      gradedAt: new Date("2026-11-14T20:01:00Z"),
    });
  });

  it("clears the old remark on a regrade without one", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");
    await analyses.grade("mariam", FIGHT_CLUB, 4, "Too short.");

    await analyses.grade("mariam", FIGHT_CLUB, -1, null);

    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toMatchObject({ grade: -1, remark: null });
  });

  it("refuses to grade a movie with no Analysis, and creates none", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", MEMENTO, "About Memento.");

    expect(await analyses.grade("mariam", FIGHT_CLUB, 7, null)).toEqual({ outcome: "no-analysis" });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toBeNull();
    expect(await analyses.forMovie("mariam", MEMENTO)).toMatchObject({ grade: null });
  });
});

describe("a graded Analysis is locked", () => {
  it("refuses a write that arrives right after the Grade, keeping the graded text and Grade", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");
    clock.advance(MINUTE);
    await analyses.grade("mariam", FIGHT_CLUB, 9, "Spot on.");

    expect(await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator, and Marla is real.")).toEqual({
      outcome: "already-graded",
    });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toEqual({
      movieId: FIGHT_CLUB,
      text: "Tyler is the narrator.",
      submittedAt: new Date("2026-11-14T20:00:00Z"),
      editedAt: new Date("2026-11-14T20:00:00Z"),
      grade: 9,
      remark: "Spot on.",
      gradedAt: new Date("2026-11-14T20:01:00Z"),
    });
  });

  it("still lets the writer write other movies' Analyses", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "About Fight Club.");
    await analyses.grade("mariam", FIGHT_CLUB, 9, null);

    expect(await analyses.write("giorgi", MEMENTO, "About Memento.")).toMatchObject({ outcome: "written" });
  });
});

describe("deleting an Analysis", () => {
  it("lets the writer delete his ungraded Analysis, which is then gone for both Viewers", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");

    expect(await analyses.remove("giorgi", FIGHT_CLUB)).toEqual({ outcome: "removed" });
    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toBeNull();
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toBeNull();
  });

  it("refuses anyone but the writer, and keeps the Analysis", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");

    expect(await analyses.remove("mariam", FIGHT_CLUB)).toEqual({ outcome: "wrong-viewer" });
    expect(await analyses.forMovie("giorgi", FIGHT_CLUB)).toMatchObject({ text: "Tyler is the narrator." });
  });

  it("refuses when the movie has no Analysis, leaving other movies' alone", async () => {
    const { analyses } = setUp();
    await analyses.write("giorgi", MEMENTO, "About Memento.");

    expect(await analyses.remove("giorgi", FIGHT_CLUB)).toEqual({ outcome: "no-analysis" });
    expect(await analyses.forMovie("mariam", MEMENTO)).toMatchObject({ text: "About Memento." });
  });

  it("refuses once the Analysis is graded, keeping the text and Grade", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.");
    clock.advance(MINUTE);
    await analyses.grade("mariam", FIGHT_CLUB, 7, "Good, but short.");

    expect(await analyses.remove("giorgi", FIGHT_CLUB)).toEqual({ outcome: "already-graded" });
    expect(await analyses.forMovie("mariam", FIGHT_CLUB)).toEqual({
      movieId: FIGHT_CLUB,
      text: "Tyler is the narrator.",
      submittedAt: new Date("2026-11-14T20:00:00Z"),
      editedAt: new Date("2026-11-14T20:00:00Z"),
      grade: 7,
      remark: "Good, but short.",
      gradedAt: new Date("2026-11-14T20:01:00Z"),
    });
  });

  it("lets the movie get a new Analysis afterwards, submitted anew", async () => {
    const { clock, analyses } = setUp();
    await analyses.write("giorgi", FIGHT_CLUB, "Didn't mean to submit this.");
    await analyses.remove("giorgi", FIGHT_CLUB);
    clock.advance(10 * MINUTE);

    expect(await analyses.write("giorgi", FIGHT_CLUB, "Tyler is the narrator.")).toEqual({
      outcome: "written",
      analysis: {
        movieId: FIGHT_CLUB,
        text: "Tyler is the narrator.",
        submittedAt: new Date("2026-11-14T20:10:00Z"),
        editedAt: new Date("2026-11-14T20:10:00Z"),
        grade: null,
        remark: null,
        gradedAt: null,
      },
    });
    expect(await analyses.grade("mariam", FIGHT_CLUB, 5, null)).toMatchObject({ outcome: "graded" });
  });
});
