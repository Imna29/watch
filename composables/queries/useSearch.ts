import { queryOptions, useQuery } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { SearchResponse } from '~/models/apiModels/watch/SearchResult'

export const searchOptions = {
  search: (query: MaybeRefOrGetter<string>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.search(toValue(query))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).search(toValue(query))
      },
      enabled: computed(() => toValue(query).length > 0),
    }),
}

export function useSearch(query: MaybeRefOrGetter<string>) {
  return useQuery(searchOptions.search(query))
}
