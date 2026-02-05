import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
})
