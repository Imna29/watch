import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import type { WatchPlaylist, WatchPlaylistWithItems, WatchPlaylistType, WatchPlaylistItemType } from '~/models/apiModels/watch/Playlist'
import { findPlaylistByType } from '~/utils/playlists'

export const playlistOptions = {
  all: () => {
    return queryOptions({
      queryKey: queryKeys.playlists.all,
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getAllPlaylists()
      },
    })
  },
  byId: (id: MaybeRefOrGetter<string>) => {
    return queryOptions({
      queryKey: computed(() => queryKeys.playlists.byId(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getPlaylist(toValue(id))
      },
    })
  },
  items: (id: MaybeRefOrGetter<string>) => {
    return queryOptions({
      queryKey: computed(() => queryKeys.playlists.items(toValue(id))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getPlaylistItems(toValue(id))
      },
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

/**
 * Adds content to one of the Viewer's built-in playlists (History, Watch Later,
 * Favorites), looking the playlist id up through the query cache. Rejects if
 * the Viewer has no playlist of that type or the request fails — callers decide
 * how to surface that.
 */
export function useAddToSystemPlaylist() {
  const queryClient = useQueryClient()
  const { mutateAsync: addToPlaylist } = useAddToPlaylist()
  const allPlaylists = playlistOptions.all()

  return async function addToSystemPlaylist(
    type: WatchPlaylistType,
    contentId: number,
    contentType: WatchPlaylistItemType
  ) {
    const playlists = await queryClient.fetchQuery({
      ...allPlaylists,
      staleTime: 1000 * 60 * 5,
    })

    const playlist = findPlaylistByType(playlists, type)
    if (!playlist) {
      throw new Error(`No ${type} playlist exists for this Viewer`)
    }

    await addToPlaylist({ playlistId: playlist.id, contentId, contentType })
  }
}
