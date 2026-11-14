import { MutationObserver, QueryClient } from "@tanstack/vue-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "../../composables/queryKeys";
import { writeAnalysisMutation } from "../../composables/queries/writeAnalysisMutation";
import type { Analysis } from "../../models/apiModels/watch/Analysis";

const FIGHT_CLUB = 550;
const TEXT = "Tyler is the narrator.\n\nThe ending is a breakdown, not a victory.";

/** Fight Club's Analysis as the server answers Giorgi's first Submit. */
const SUBMITTED: Analysis = {
  movieId: FIGHT_CLUB,
  text: TEXT,
  submittedAt: "2026-11-14T20:00:00.000Z",
  editedAt: "2026-11-14T20:00:00.000Z",
  grade: null,
  remark: null,
  gradedAt: null,
};

describe("writing an Analysis", () => {
  it("shows the writer's text on the movie's page as soon as his first Submit succeeds", async () => {
    const queryClient = new QueryClient();
    const movieAnalysis = queryKeys.analyses.byMovie(FIGHT_CLUB);
    // The movie's page has loaded: no Analysis yet.
    queryClient.setQueryData(movieAnalysis, null);
    // Run as `useMutation` runs it: an observer the page listens to.
    const write = new MutationObserver(
      queryClient,
      writeAnalysisMutation(queryClient, async () => ({ analysis: SUBMITTED })),
    );
    write.subscribe(() => {});

    // The page clears its draft on success, before any refetch is back: what
    // the movie's Analysis is then is what the page shows.
    const shownOnSuccess = await new Promise((resolve) => {
      write.mutate(
        { movieId: FIGHT_CLUB, text: TEXT },
        { onSuccess: () => resolve(queryClient.getQueryData(movieAnalysis)) },
      );
    });

    expect(shownOnSuccess).toEqual(SUBMITTED);
  });
});
