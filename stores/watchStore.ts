export const useWatchStore = defineStore("watchStore", () => {
  const { $apiClient } = useNuxtApp();
  const watchRepo = watchRepository($apiClient);
  const searchQuery = ref<string>("");
  const isSearching = computed(() => searchQuery.value.length > 0);
  const router = useRouter();
  const route = useRoute();

  // Watch route.query.q and update searchQuery
  watch(
    () => route.query.q,
    (q) => {
      if (q?.toString() !== searchQuery.value) {
        searchQuery.value = q?.toString() || "";
      }
    },
    { immediate: true },
  );

  // Watch searchQuery and update route query parameter
  watch(searchQuery, (query) => {
    if (query !== route.query.q) {
      if (query.length > 0) {
        if (!route.query.q) {
          // Transition from empty to non-empty, push new history entry
          router.push({ query: { ...route.query, q: query } });
        } else {
          // Replace current URL
          router.replace({ query: { ...route.query, q: query } });
        }
      } else {
        // Query is empty, remove 'q' from URL
        const newQuery = { ...route.query };
        delete newQuery.q;
        router.replace({ query: newQuery });
      }
    }
  });

  function clearSearch() {
    searchQuery.value = "";
  }

  return {
    watchRepo,
    searchQuery,
    isSearching,
    clearSearch,
  };
});
