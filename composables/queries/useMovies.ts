import { queryOptions, useQuery } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { MovieDetails, MovieResponse, GenreResponse } from '~/models/apiModels/watch/MovieModels'

export const movieOptions = {
  byId: (id: MaybeRefOrGetter<number>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.movies.byId(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getMovieById(toValue(id))
      },
    }),
  genres: () =>
    queryOptions({
      queryKey: queryKeys.movies.genres(),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getMovieGenres()
      },
    }),
  trending: (time: MaybeRefOrGetter<'day' | 'week'>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.movies.trending(toValue(time))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getTrendingMovies(toValue(time))
      },
    }),
}

export function useMovie(id: MaybeRefOrGetter<number>) {
  return useQuery(movieOptions.byId(id))
}

export function useMovieGenres() {
  return useQuery(movieOptions.genres())
}

export function useTrendingMovies(time: MaybeRefOrGetter<'day' | 'week'>) {
  return useQuery(movieOptions.trending(time))
}
