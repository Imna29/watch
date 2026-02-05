import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { WatchedEpisode, LastWatched } from '~/models/apiModels/watch/WatchedEpisode'

export const watchedOptions = {
  all: () => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: queryKeys.watched.all,
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getWatchedEpisodes()
      },
      enabled: loggedIn,
    })
  },
  byTvId: (tvId: MaybeRefOrGetter<number>) => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: computed(() => queryKeys.watched.byTvId(toValue(tvId))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getWatchedEpisodes()
      },
      select: (data: WatchedEpisode[]) =>
        data.filter((episode) => episode.tvId === toValue(tvId)),
      enabled: loggedIn,
    })
  },
  last: (tvId: MaybeRefOrGetter<number>) => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: computed(() => queryKeys.watched.last(toValue(tvId))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getLastWatchedEpisodes(toValue(tvId))
      },
      enabled: loggedIn,
    })
  },
}

export function useWatchedEpisodes() {
  return useQuery(watchedOptions.all())
}

export function useWatchedEpisodesByTvId(tvId: MaybeRefOrGetter<number>) {
  return useQuery(watchedOptions.byTvId(tvId))
}

export function useLastWatchedEpisode(tvId: MaybeRefOrGetter<number>) {
  return useQuery(watchedOptions.last(tvId))
}

export function useAddWatchedEpisode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tvId,
      seasonNumber,
      episodeNumber,
    }: {
      tvId: number
      seasonNumber: number
      episodeNumber: number
    }) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).addWatchedEpisode(tvId, seasonNumber, episodeNumber)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watched.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.watched.byTvId(variables.tvId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.watched.last(variables.tvId),
      })
    },
  })
}
