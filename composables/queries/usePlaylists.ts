import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { WatchPlaylist, WatchPlaylistWithItems } from '~/models/apiModels/watch/Playlist'

export const playlistOptions = {
  all: () => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: queryKeys.playlists.all,
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getAllPlaylists()
      },
      enabled: loggedIn,
    })
  },
  byId: (id: MaybeRefOrGetter<string>) => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: computed(() => queryKeys.playlists.byId(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getPlaylist(toValue(id))
      },
      enabled: loggedIn,
    })
  },
  items: (id: MaybeRefOrGetter<string>) => {
    const { loggedIn } = useAuth()
    return queryOptions({
      queryKey: computed(() => queryKeys.playlists.items(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getPlaylistItems(toValue(id))
      },
      enabled: loggedIn,
    })
  },
}

export function usePlaylists() {
  return useQuery(playlistOptions.all())
}

export function usePlaylist(id: MaybeRefOrGetter<string>) {
  return useQuery(playlistOptions.byId(id))
}

export function usePlaylistItems(id: MaybeRefOrGetter<string>) {
  return useQuery(playlistOptions.items(id))
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).createPlaylist(name)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all })
    },
  })
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).deletePlaylist(playlistId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all })
    },
  })
}

export function useAddToPlaylist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      playlistId,
      contentId,
      contentType,
    }: {
      playlistId: string
      contentId: number
      contentType: 'MOVIE' | 'TV_SHOW'
    }) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).addToPlaylist(playlistId, contentId, contentType)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.playlists.items(variables.playlistId),
      })
    },
  })
}

export function useDeleteFromPlaylist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      playlistId,
      itemIds,
    }: {
      playlistId: string
      itemIds: string[]
    }) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).deleteFromPlaylist(playlistId, itemIds)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.playlists.items(variables.playlistId),
      })
    },
  })
}
