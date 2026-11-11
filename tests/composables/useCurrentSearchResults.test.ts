import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useCurrentSearchResults } from "../../composables/useCurrentSearchResults";

const BATMAN = ["Batman Begins", "The Batman"];
const BAT = ["Batman Begins"];
const SHREK = ["Shrek"];

// Drives the three refs the way `useSearch` (vue-query + keepPreviousData)
// updates them, then lets the watchers run.
function searchBox() {
  const query = ref("");
  const data = ref<string[] | undefined>(undefined);
  const isPlaceholderData = ref(false);
  const results = useCurrentSearchResults(query, data, isPlaceholderData);

  async function show(q: string, d: string[] | undefined, placeholder: boolean) {
    query.value = q;
    data.value = d;
    isPlaceholderData.value = placeholder;
    await nextTick();
  }

  return { results, show };
}

describe("useCurrentSearchResults", () => {
  it("shows a search's own results", async () => {
    const { results, show } = searchBox();
    await show("batman", BATMAN, false);
    expect(results.value).toEqual(BATMAN);
  });

  it("keeps the previous query's results on screen while the user keeps typing", async () => {
    const { results, show } = searchBox();
    await show("bat", BAT, false);
    await show("batm", BAT, true);
    expect(results.value).toEqual(BAT);
  });

  it("does not show the previous search's results after the box was cleared", async () => {
    const { results, show } = searchBox();
    await show("batman", BATMAN, false);
    // vue-query keeps the last data as placeholder even for the disabled "" query.
    await show("", BATMAN, true);
    await show("s", BATMAN, true);
    expect(results.value).toBeUndefined();

    await show("s", SHREK, false);
    expect(results.value).toEqual(SHREK);
  });

  it("keeps placeholder results again once the new search has its own", async () => {
    const { results, show } = searchBox();
    await show("batman", BATMAN, false);
    await show("", BATMAN, true);
    await show("shrek", SHREK, false);
    await show("shrek 2", SHREK, true);
    expect(results.value).toEqual(SHREK);
  });
});
