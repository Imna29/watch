export const queryKeys = {
  movies: {
    all: ['movies'] as const,
    byId: (id: number) => ['movies', id] as const,
    trending: (time: 'day' | 'week') => ['movies', 'trending', time] as const,
    genres: () => ['movies', 'genres'] as const,
    discover: (genreIds: number[], sortBy: string, page: number) => 
      ['movies', 'discover', genreIds, sortBy, page] as const,
  },
  tv: {
    all: ['tv'] as const,
    byId: (id: number) => ['tv', id] as const,
    trending: (time: 'day' | 'week') => ['tv', 'trending', time] as const,
    genres: () => ['tv', 'genres'] as const,
    season: (tvId: number, seasonNumber: number) => 
      ['tv', tvId, 'season', seasonNumber] as const,
    discover: (genreIds: number[], sortBy: string, page: number) => 
      ['tv', 'discover', genreIds, sortBy, page] as const,
  },
  all: {
    trending: (time: 'day' | 'week') => ['all', 'trending', time] as const,
  },
  playlists: {
    all: ['playlists'] as const,
    byId: (id: string) => ['playlists', id] as const,
    items: (id: string) => ['playlists', id, 'items'] as const,
  },
  watched: {
    all: ['watched'] as const,
    byTvId: (tvId: number) => ['watched', tvId] as const,
    last: (tvId: number) => ['watched', tvId, 'last'] as const,
  },
  search: (query: string) => ['search', query] as const,
} as const
