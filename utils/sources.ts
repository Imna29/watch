/**
 * The Source catalog: every Source the player offers, and the one place that
 * knows their embed URLs and the origins their players post messages from.
 * Providers change domains and parameters without notice, so nothing else in
 * the app should hard-code them.
 *
 * Framework-free (no Nuxt auto-imports): it is used by the player shell, the
 * Syncable Source adapters and plain-Node tests alike.
 *
 * URL parameters of CineSrc and VidFast follow their own docs as of
 * November 2026 (see docs/adr/0002-watch-parties-on-syncable-sources.md).
 */

export type SourceId =
  | "vidlink"
  | "vidsrc-cc"
  | "vidsrc-xyz"
  | "multiembed"
  | "2embed"
  | "moviesapi"
  | "cinesrc"
  | "vidfast";

/** What a Source is asked to play: a movie, or one episode of a TV show. */
export type Playable =
  | { kind: "movie"; tmdbId: number }
  | { kind: "episode"; tmdbId: number; season: number; episode: number };

export interface EmbedOptions {
  /**
   * Where playback starts, in seconds. Defaults to the beginning.
   * Only Syncable Sources honour it; the other Sources ignore it.
   */
  startAt?: number;
}

export interface Source {
  readonly id: SourceId;
  /** Shown in the "Source" picker. */
  readonly name: string;
  /** Whether the site can control its player, so it can host a Watch Party. */
  readonly syncable: boolean;
  /**
   * Origins the Source's player may post messages from. A Syncable Source
   * adapter ignores messages from any other origin. For the other Sources this
   * is just the origin of their embed page; the site does not listen to them.
   */
  readonly origins: readonly string[];
  /**
   * The iframe URL that plays `playable`. Syncable Source URLs always
   * autoplay from the start time, without the Source's own "continue where
   * you left off" prompt, auto-advance to the next episode, or (where the
   * Source supports turning it off) fullscreen button.
   */
  embedUrl(playable: Playable, options?: EmbedOptions): string;
}

function withParams(page: string, params: Record<string, string | number>): string {
  const url = new URL(page);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }
  return url.toString();
}

const VIDLINK = "https://vidlink.pro";
const VIDSRC_CC = "https://vidsrc.cc";
const VIDSRC_XYZ = "https://vidsrc.xyz";
const MULTIEMBED = "https://multiembed.mov";
const TWO_EMBED = "https://www.2embed.cc";
const MOVIESAPI = "https://moviesapi.club";
const CINESRC = "https://cinesrc.st";
const VIDFAST = "https://vidfast.vc";

/** The VidFast docs list these as its domains; embeds use vidfast.vc. */
const VIDFAST_ORIGINS = [
  "https://vidfast.pro",
  "https://vidfast.in",
  "https://vidfast.io",
  "https://vidfast.me",
  "https://vidfast.net",
  "https://vidfast.pm",
  "https://vidfast.xyz",
  "https://vidfast.vc",
  "https://vidfast.bz",
];

/** Every Source, in the order the "Source" picker lists them. */
export const SOURCES: readonly Source[] = [
  {
    id: "vidlink",
    name: "VidLink",
    syncable: false,
    origins: [VIDLINK],
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${VIDLINK}/movie/${p.tmdbId}`
        : `${VIDLINK}/tv/${p.tmdbId}/${p.season}/${p.episode}`,
  },
  {
    id: "vidsrc-cc",
    name: "VidSrc.cc",
    syncable: false,
    origins: [VIDSRC_CC],
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${VIDSRC_CC}/v2/embed/movie/${p.tmdbId}`
        : `${VIDSRC_CC}/v2/embed/tv/${p.tmdbId}/${p.season}/${p.episode}`,
  },
  {
    id: "vidsrc-xyz",
    name: "VidSrc.xyz",
    syncable: false,
    origins: [VIDSRC_XYZ],
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${VIDSRC_XYZ}/embed/movie/${p.tmdbId}`
        : `${VIDSRC_XYZ}/embed/tv?tmdb=${p.tmdbId}&season=${p.season}&episode=${p.episode}`,
  },
  {
    id: "multiembed",
    name: "MultiEmbed",
    syncable: false,
    origins: [MULTIEMBED],
    // Without tmdb=1, MultiEmbed reads video_id as an IMDb id.
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${MULTIEMBED}/directstream.php?video_id=${p.tmdbId}&tmdb=1`
        : `${MULTIEMBED}/directstream.php?video_id=${p.tmdbId}&tmdb=1&s=${p.season}&e=${p.episode}`,
  },
  {
    id: "2embed",
    name: "2Embed",
    syncable: false,
    origins: [TWO_EMBED],
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${TWO_EMBED}/embed/${p.tmdbId}`
        : `${TWO_EMBED}/embedtv/${p.tmdbId}&s=${p.season}&e=${p.episode}`,
  },
  {
    id: "moviesapi",
    name: "MoviesAPI",
    syncable: false,
    origins: [MOVIESAPI],
    embedUrl: (p) =>
      p.kind === "movie"
        ? `${MOVIESAPI}/movie/${p.tmdbId}`
        : `${MOVIESAPI}/tv/${p.tmdbId}-${p.season}-${p.episode}`,
  },
  {
    id: "cinesrc",
    name: "CineSrc",
    syncable: true,
    origins: [CINESRC],
    // CineSrc has no switch for its fullscreen button alone; the player shell's
    // iframe does not allow fullscreen, which disables it.
    embedUrl: (p, { startAt = 0 } = {}) => {
      const page =
        p.kind === "movie"
          ? `${CINESRC}/embed/movie/${p.tmdbId}`
          : `${CINESRC}/embed/tv/${p.tmdbId}?s=${p.season}&e=${p.episode}`;
      return withParams(page, {
        autoplay: "true",
        t: startAt,
        continueprompt: "false",
        autonext: "false",
      });
    },
  },
  {
    id: "vidfast",
    name: "VidFast",
    syncable: true,
    origins: VIDFAST_ORIGINS,
    // startAt is always sent, even 0: without it VidFast silently resumes from
    // the position it saved itself.
    embedUrl: (p, { startAt = 0 } = {}) =>
      p.kind === "movie"
        ? withParams(`${VIDFAST}/movie/${p.tmdbId}`, {
            autoPlay: "true",
            startAt,
            fullscreenButton: "false",
          })
        : withParams(`${VIDFAST}/tv/${p.tmdbId}/${p.season}/${p.episode}`, {
            autoPlay: "true",
            startAt,
            nextButton: "false",
            autoNext: "false",
            fullscreenButton: "false",
          }),
  },
];

export function getSource(id: SourceId): Source {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Unknown Source: ${id}`);
  return source;
}
