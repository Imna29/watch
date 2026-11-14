import type { QueryClient } from '@tanstack/vue-query'
import type { Analysis } from '~/models/apiModels/watch/Analysis'
import { queryKeys } from '../queryKeys'

/** The request that writes a movie's Analysis (`watchRepository.writeAnalysis`). */
export type WriteAnalysisRequest = (movieId: number, text: string) => Promise<{ analysis: Analysis }>

/**
 * `useWriteAnalysis`'s mutation. Framework-free, so tests run it on a real
 * QueryClient (`tests/composables/writeAnalysisMutation.test.ts`).
 */
export function writeAnalysisMutation(queryClient: QueryClient, write: WriteAnalysisRequest) {
  return {
    mutationFn: ({ movieId, text }: { movieId: number; text: string }) => write(movieId, text),
    // The page clears its draft as soon as the write succeeds: the movie's
    // section shows the stored text from then on, not the empty write box
    // until the refetch below is back.
    onSuccess: ({ analysis }: { analysis: Analysis }) => {
      queryClient.setQueryData(queryKeys.analyses.byMovie(analysis.movieId), analysis)
    },
    // Also after a refusal, so the page shows the Analysis as the server has it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.all })
    },
  }
}
