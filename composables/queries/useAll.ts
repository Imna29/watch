import { queryOptions, useQuery } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { MovieOrTvResponse } from '~/models/apiModels/watch/MovieModels'

export const allOptions = {
  trending: (time: MaybeRefOrGetter<'day' | 'week'>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.all.trending(toValue(time))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getTrendingAll(toValue(time))
      },
    }),
}

export function useTrendingAll(time: MaybeRefOrGetter<'day' | 'week'>) {
  return useQuery(allOptions.trending(time))
}
