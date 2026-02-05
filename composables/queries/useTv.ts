import { queryOptions, useQuery } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { TVShowDetails, TVShowsResponse, GenreResponse, SeasonData } from '~/models/apiModels/watch/TvModels'

export const tvOptions = {
  byId: (id: MaybeRefOrGetter<number>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.tv.byId(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getTvById(toValue(id))
      },
    }),
  genres: () =>
    queryOptions({
      queryKey: queryKeys.tv.genres(),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getTvGenres()
      },
    }),
  trending: (time: MaybeRefOrGetter<'day' | 'week'>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.tv.trending(toValue(time))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getTrendingTv(toValue(time))
      },
    }),
  season: (tvId: MaybeRefOrGetter<number>, seasonNumber: MaybeRefOrGetter<number>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.tv.season(toValue(tvId), toValue(seasonNumber))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getSeasonData(toValue(tvId), toValue(seasonNumber))
      },
    }),
}

export function useTvShow(id: MaybeRefOrGetter<number>) {
  return useQuery(tvOptions.byId(id))
}

export function useTvGenres() {
  return useQuery(tvOptions.genres())
}

export function useTrendingTv(time: MaybeRefOrGetter<'day' | 'week'>) {
  return useQuery(tvOptions.trending(time))
}

export function useSeasonData(
  tvId: MaybeRefOrGetter<number>,
  seasonNumber: MaybeRefOrGetter<number>
) {
  return useQuery(tvOptions.season(tvId, seasonNumber))
}
