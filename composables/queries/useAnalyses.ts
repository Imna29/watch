import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { queryKeys } from '../queryKeys'
import { watchRepository } from '~/utils/watchRepository'
import { writeAnalysisMutation } from './writeAnalysisMutation'

// The other Viewer changes Analyses from their own device, and nothing tells
// this one, so these queries are stale at once (not after the app's 5
// minutes, `plugins/vue-query.ts`): a page that shows them reads them again
// when it mounts.
export const analysisOptions = {
  /** Every Analysis in list order, with the average Grade (null while none is graded) and the count to grade. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.analyses.list(),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        return watchRepository($apiClient).getAnalyses()
      },
      staleTime: 0,
    }),
  /** How many Analyses wait for a Grade: the ungraded ones for the grader, zero for anyone else. */
  toGrade: () =>
    queryOptions({
      queryKey: queryKeys.analyses.toGrade(),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        const { count } = await watchRepository($apiClient).getAnalysesToGrade()
        return count
      },
      staleTime: 0,
      // The header that shows it stays mounted, so it reads it again every
      // minute and whenever the window comes back into focus.
      refetchInterval: 60 * 1000,
      refetchOnWindowFocus: true,
    }),
  /** The movie's Analysis, or null when it has none. */
  byMovie: (movieId: MaybeRefOrGetter<number>) =>
    queryOptions({
      queryKey: computed(() => queryKeys.analyses.byMovie(toValue(movieId))),
      queryFn: async () => {
        const { $apiClient } = useNuxtApp()
        const { analysis } = await watchRepository($apiClient).getAnalysis(toValue(movieId))
        return analysis
      },
      staleTime: 0,
    }),
}

export function useAnalysisList() {
  return useQuery(analysisOptions.list())
}

/** The count of Analyses to grade. In the `analyses` group, so every Analyses mutation refreshes it. */
export function useAnalysesToGrade(options: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  return useQuery({
    ...analysisOptions.toGrade(),
    enabled: computed(() => toValue(options.enabled) ?? true),
  })
}

export function useMovieAnalysis(movieId: MaybeRefOrGetter<number>) {
  return useQuery(analysisOptions.byMovie(movieId))
}

/** Writes a movie's Analysis, or replaces its text. Only the writer may (`ANALYSIS_WRITER`). */
export function useWriteAnalysis() {
  const queryClient = useQueryClient()

  return useMutation(
    writeAnalysisMutation(queryClient, async (movieId, text) => {
      const { $apiClient } = useNuxtApp()
      return watchRepository($apiClient).writeAnalysis(movieId, text)
    }),
  )
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
