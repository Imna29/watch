import { describe, expect, it } from "vitest";
import { SOURCES, getSource, type SourceId } from "../../utils/sources";

const fightClub = { kind: "movie", tmdbId: 550 } as const;
const gameOfThronesS2E3 = { kind: "episode", tmdbId: 1399, season: 2, episode: 3 } as const;

function parse(embedUrl: string) {
  const url = new URL(embedUrl);
  return { page: url.origin + url.pathname, params: Object.fromEntries(url.searchParams) };
}

describe("Source catalog", () => {
  it.each<[SourceId, string, string]>([
    [
      "vidlink",
      "https://vidlink.pro/movie/550",
      "https://vidlink.pro/tv/1399/2/3",
    ],
    [
      "vidsrc-cc",
      "https://vidsrc.cc/v2/embed/movie/550",
      "https://vidsrc.cc/v2/embed/tv/1399/2/3",
    ],
    [
      "vidsrc-xyz",
      "https://vidsrc.xyz/embed/movie/550",
      "https://vidsrc.xyz/embed/tv?tmdb=1399&season=2&episode=3",
    ],
    [
      "2embed",
      "https://www.2embed.cc/embed/550",
      "https://www.2embed.cc/embedtv/1399&s=2&e=3",
    ],
    [
      "moviesapi",
      "https://moviesapi.club/movie/550",
      "https://moviesapi.club/tv/1399-2-3",
    ],
  ])("%s still plays a movie and an episode from the same URLs as before", (id, movieUrl, episodeUrl) => {
    const source = getSource(id);
    expect(source.embedUrl(fightClub)).toBe(movieUrl);
    expect(source.embedUrl(gameOfThronesS2E3)).toBe(episodeUrl);
  });


  it("MultiEmbed asks for movies and episodes by TMDB id", () => {
    const multiEmbed = getSource("multiembed");
    expect(multiEmbed.embedUrl(fightClub)).toBe(
      "https://multiembed.mov/directstream.php?video_id=550&tmdb=1",
    );
    expect(multiEmbed.embedUrl(gameOfThronesS2E3)).toBe(
      "https://multiembed.mov/directstream.php?video_id=1399&tmdb=1&s=2&e=3",
    );
  });

  it("CineSrc autoplays from the start time, with no continue prompt and no auto-advance", () => {
    const cineSrc = getSource("cinesrc");

    const movie = parse(cineSrc.embedUrl(fightClub, { startAt: 90 }));
    expect(movie.page).toBe("https://cinesrc.st/embed/movie/550");
    expect(movie.params).toEqual({
      autoplay: "true",
      t: "90",
      continueprompt: "false",
      autonext: "false",
    });

    const episode = parse(cineSrc.embedUrl(gameOfThronesS2E3, { startAt: 1234.5 }));
    expect(episode.page).toBe("https://cinesrc.st/embed/tv/1399");
    expect(episode.params).toEqual({
      s: "2",
      e: "3",
      autoplay: "true",
      t: "1234.5",
      continueprompt: "false",
      autonext: "false",
    });
  });

  it("VidFast autoplays from the start time, with no auto-advance and no fullscreen button of its own", () => {
    const vidFast = getSource("vidfast");

    const movie = parse(vidFast.embedUrl(fightClub, { startAt: 90 }));
    expect(movie.page).toBe("https://vidfast.vc/movie/550");
    expect(movie.params).toEqual({
      autoPlay: "true",
      startAt: "90",
      fullscreenButton: "false",
    });

    const episode = parse(vidFast.embedUrl(gameOfThronesS2E3, { startAt: 1234.5 }));
    expect(episode.page).toBe("https://vidfast.vc/tv/1399/2/3");
    expect(episode.params).toEqual({
      autoPlay: "true",
      startAt: "1234.5",
      nextButton: "false",
      autoNext: "false",
      fullscreenButton: "false",
    });
  });

  it("VidFast starts at the beginning when no start time is given, instead of silently resuming", () => {
    const movie = parse(getSource("vidfast").embedUrl(fightClub));
    expect(movie.params.startAt).toBe("0");
  });

  it("knows every origin a Syncable Source's player posts messages from", () => {
    expect(getSource("cinesrc").origins).toEqual(["https://cinesrc.st"]);
    expect([...getSource("vidfast").origins].sort()).toEqual([
      "https://vidfast.bz",
      "https://vidfast.in",
      "https://vidfast.io",
      "https://vidfast.me",
      "https://vidfast.net",
      "https://vidfast.pm",
      "https://vidfast.pro",
      "https://vidfast.vc",
      "https://vidfast.xyz",
    ]);
  });

  it.each(SOURCES.map((source) => [source.id, source] as const))(
    "%s's player pages are served from one of its own origins",
    (_id, source) => {
      expect(source.origins).toContain(new URL(source.embedUrl(fightClub)).origin);
      expect(source.origins).toContain(new URL(source.embedUrl(gameOfThronesS2E3)).origin);
    },
  );

  it("lists all eight Sources by name, and only CineSrc and VidFast are Syncable Sources", () => {
    expect(SOURCES.map((source) => [source.name, source.syncable])).toEqual([
      ["VidLink", false],
      ["VidSrc.cc", false],
      ["VidSrc.xyz", false],
      ["MultiEmbed", false],
      ["2Embed", false],
      ["MoviesAPI", false],
      ["CineSrc", true],
      ["VidFast", true],
    ]);
  });
});
