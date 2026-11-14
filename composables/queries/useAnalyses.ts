import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'

export const analysisOptions = {
  /** The movie's Analysis, or null when it has none. */
  byMovie: (movieId: MaybeRefOrGetter<number>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.analyses.byMovie(toValue(movieId))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        const { analysis } = await watchRepository($apiClient).getAnalysis(toValue(movieId))
        return analysis
      },
    }),
}

export function useMovieAnalysis(movieId: MaybeRefOrGetter<number>) {
  return useQuery(analysisOptions.byMovie(movieId))
}

/** Writes a movie's Analysis, or replaces its text. Only the writer may (`ANALYSIS_WRITER`). */
export function useWriteAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ movieId, text }: { movieId: number; text: string }) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).writeAnalysis(movieId, text)
    },
    // Also after a refusal, so the page shows the Analysis as the server has it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.all })
    },
  })
}

/** Deletes a movie's Analysis for good. Only the writer may (`ANALYSIS_WRITER`), until it is graded. */
export function useDeleteAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (movieId: number) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).deleteAnalysis(movieId)
    },
    // Also after a refusal (graded meanwhile), so the page shows the graded Analysis.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.all })
    },
  })
}

/**
 * Sets or replaces the Grade and remark (null for none) of a movie's
 * Analysis. Only the grader may (`ANALYSIS_GRADER`).
 */
export function useGradeAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ movieId, grade, remark }: { movieId: number; grade: number; remark: string | null }) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).gradeAnalysis(movieId, grade, remark)
    },
    // Also after a refusal (the Analysis was deleted meanwhile), so the page catches up.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.all })
    },
  })
}
