import { queryOptions, useQuery } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { MovieResponse, TVShowsResponse } from '~/models/apiModels/watch/MovieModels'

export const discoverOptions = {
  movies: (
    genreIds: MaybeRefOrGetter<number[]>,
    sortBy: MaybeRefOrGetter<'popularity.desc' | 'vote_average.desc'>,
    page: MaybeRefOrGetter<number>
  ) =>
    queryOptions({
      queryKey: computed(() =>
        queryKeys.movies.discover(toValue(genreIds), toValue(sortBy), toValue(page))
      ),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).discoverMovies(
          toValue(genreIds),
          toValue(sortBy),
          toValue(page)
        )
      },
    }),
  tv: (
    genreIds: MaybeRefOrGetter<number[]>,
    sortBy: MaybeRefOrGetter<'popularity.desc' | 'vote_average.desc'>,
    page: MaybeRefOrGetter<number>
  ) =>
    queryOptions({
      queryKey: computed(() =>
        queryKeys.tv.discover(toValue(genreIds), toValue(sortBy), toValue(page))
      ),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).discoverTv(
          toValue(genreIds),
          toValue(sortBy),
          toValue(page)
        )
      },
    }),
}

export function useDiscoverMovies(
  genreIds: MaybeRefOrGetter<number[]>,
  sortBy: MaybeRefOrGetter<'popularity.desc' | 'vote_average.desc'>,
  page: MaybeRefOrGetter<number>
) {
  return useQuery(discoverOptions.movies(genreIds, sortBy, page))
}

export function useDiscoverTv(
  genreIds: MaybeRefOrGetter<number[]>,
  sortBy: MaybeRefOrGetter<'popularity.desc' | 'vote_average.desc'>,
  page: MaybeRefOrGetter<number>
) {
  return useQuery(discoverOptions.tv(genreIds, sortBy, page))
}
