import { computed, ref, watch, type Ref } from "vue";

/**
 * The search results worth showing for `query` (the query `useSearch` was
 * given). `useSearch` keeps the previous query's results as placeholder data
 * while the next one loads, which is right while the user keeps typing. Once
 * the query has been empty, though, a new search has started: hide that
 * placeholder data until the new search has results of its own.
 */
export function useCurrentSearchResults<T>(
  query: Readonly<Ref<string>>,
  data: Readonly<Ref<T | undefined>>,
  isPlaceholderData: Readonly<Ref<boolean>>,
) {
  const clearedSinceLastResults = ref(false);

  watch(query, (q) => {
    if (q === "") clearedSinceLastResults.value = true;
  });
  watch([data, isPlaceholderData], ([d, placeholder]) => {
    if (d !== undefined && !placeholder) clearedSinceLastResults.value = false;
  });

  return computed(() =>
    clearedSinceLastResults.value && isPlaceholderData.value ? undefined : data.value,
  );
}
