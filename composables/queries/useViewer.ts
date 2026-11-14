import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import { SIGN_IN_PATH } from '~/utils/signIn'

export const viewerOptions = {
  /** The Viewer signed in on this device, or null when it is signed out. */
  current: () =>
    queryOptions({
      queryKey: queryKeys.viewer.current,
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getViewer()
      },
    }),
}

export function useViewer() {
  return useQuery(viewerOptions.current())
}

export function useSignIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (password: string) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).signIn(password)
    },
    onSuccess: ({ viewer }) => {
      // Nothing cached may belong to whoever used this device before.
      queryClient.clear()
      queryClient.setQueryData(queryKeys.viewer.current, viewer)
    },
  })
}

export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).signOut()
    },
    onSettled: () => {
      // A full page load, so nothing the signed-out Viewer saw stays in memory
      // (cached queries, kept-alive pages, the search box).
      window.location.assign(SIGN_IN_PATH)
    },
  })
}
