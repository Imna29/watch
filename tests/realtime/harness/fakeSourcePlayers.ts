/**
 * Fake Source players for seam 1: what runs inside the Watch Party player's
 * iframe. Each one simulates a video on the fake clock and speaks its
 * Syncable Source's documented `postMessage` format (its "dialect"), so the
 * real adapters are tested against the format, not against themselves.
 *
 * Adding a Syncable Source: write its dialect below and list it in
 * `DIALECTS`. Every Source with an adapter must have one; the Watch Party
 * scenarios then run on it too.
 */
import type { Clock } from "../../../realtime/clock";
import type { PlayerFrame } from "../../../realtime/watchParty/sources/adapter";
import type { AdaptedSourceId } from "../../../realtime/watchParty/sources";
import { getSource, type Playable, type SourceId } from "../../../utils/sources";

/**
 * Where a player option applies: `true` for every Source, a list of
 * Sources, or a test of a Source and what it is asked to play.
 */
export type ForSources = boolean | readonly SourceId[] | ((source: SourceId, playable: Playable) => boolean);

export interface FakePlayerOptions {
  /** How long the player takes to find a stream and say it is ready. */
  loadMs?: number;
  /**
   * No server of the Source has the Title: after `loadMs` the player gives
   * up, and says so if its Source does (VidFast does; CineSrc says nothing).
   */
  unavailable?: ForSources;
  /** The Source is down: its player never loads and never says a thing. */
  hangs?: ForSources;
  /** The browser does not let the player start on its own: it waits, paused, for a command. */
  noAutoplay?: boolean;
  /**
   * The browser will not let the player start with sound until the Viewer
   * clicks in the page (as after a page reload): no autoplay, and the site's
   * play commands do nothing, until `FakeFrame.click()` or a press on the
   * player's own play button.
   */
  blocksPlayUntilClick?: boolean;
  /**
   * How long a seek takes to buffer: the video stands still at the new
   * position meanwhile, and "seeked" comes only after it. Default: at once.
   */
  seekMs?: number;
}

/**
 * What a Viewer does with the Source's own controls, inside the player. The
 * player acts as it would on a real click and posts what its Source posts
 * about it. Throws before the player is ready: there is nothing to press yet.
 */
export interface FakePlayerControls {
  play(): void;
  pause(): void;
  /** Drags the progress bar to `position` seconds. */
  seek(position: number): void;
  /** Picks a speed in the player's speed menu. */
  setSpeed(rate: number): void;
  /** A personal setting: the player's volume, 0 to 1. */
  setVolume(volume: number): void;
  /**
   * Picks another episode in the player's own episode list (or presses its
   * next-episode button): the player moves there by itself. Only on a
   * Source whose player keeps these in a Watch Party (`playerHasOwnEpisodeList`).
   */
  chooseEpisode(episode: { season: number; episode: number }): void;
}

/** A Source's player, as a test sees it. */
export interface FakeSourcePlayer {
  readonly sourceId: SourceId;
  /** What the player plays: what the embed URL asked for, unless the Viewer chose another episode in it. */
  readonly playable: Playable;
  readonly ready: boolean;
  readonly paused: boolean;
  /** Seconds into the Title, now. */
  readonly position: number;
  readonly rate: number;
  readonly volume: number;
  /** How long the Title is, in seconds. At the end, the player pauses and says it ended. */
  readonly duration: number;
  /** The Viewer in front of this player, using the Source's own controls. */
  readonly controls: FakePlayerControls;
  /**
   * The stream stalls for `ms` (the network is slow): the video stands still
   * and posts no `timeupdate` until it has buffered, then plays on (if it is
   * not paused).
   */
  stall(ms: number): void;
  /**
   * The stream skips `seconds` ahead by itself (a glitch in it): the video
   * jumps there without a seek, so the player posts no "seeked", only its
   * time updates from there on.
   */
  skip(seconds: number): void;
  /**
   * Posts what tells the site this Source's player is ready (CineSrc's
   * "ready" message, VidFast's status), from `origin` instead of the
   * Source's own: what a page the iframe was sent to (an ad, say) could post.
   */
  postReadyFrom(origin: string): void;
}

/** The Watch Party player's iframe, holding at most one fake player at a time. */
export interface FakeFrame extends PlayerFrame {
  /** The player in the frame now; null before anything loaded and after `remove()`. */
  readonly player: FakeSourcePlayer | null;
  /** The Viewer clicks in the page (a button over the player, say): from then on the browser lets the player start. */
  click(): void;
  /** The iframe is removed from the page. */
  remove(): void;
}

type VideoEvent =
  | "ready"
  /** No server of the Source has the Title. */
  | "unavailable"
  | "play"
  | "pause"
  | "seeking"
  | "seeked"
  | "timeupdate"
  | "ratechange"
  | "volumechange"
  | "ended";

/** The simulated `<video>` inside a fake player. */
interface FakeVideo {
  /** What the player plays. */
  readonly playable: Playable;
  readonly paused: boolean;
  readonly position: number;
  readonly rate: number;
  readonly volume: number;
  readonly duration: number;
  play(): void;
  pause(): void;
  seek(position: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
}

/** How one Syncable Source's player talks. */
interface Dialect {
  /** How often a playing video posts its position. */
  timeupdateMs: number;
  /** What the embed URL asks for. */
  parseUrl(url: URL): { playable: Playable; startAt: number; autoplay: boolean };
  /** Handles a message from the site once the player is ready; `reply` posts an answer. */
  receive(data: unknown, video: FakeVideo, reply: (data: unknown) => void): void;
  /** The message the player posts for `event`; null when this Source posts none. */
  message(event: VideoEvent, video: FakeVideo): unknown;
  /** A message the site takes to mean the player is ready. */
  readySignal(video: FakeVideo): unknown;
  /**
   * The message the player posts once it moved to another episode by itself
   * (its own episode list or next-episode button). Absent when the Watch
   * Party's embed URL leaves the player without those.
   */
  episodeChosen?(episode: { season: number; episode: number }): unknown;
}

/** CineSrc, after https://cinesrc.st/docs (November 2026). */
const cinesrc: Dialect = {
  // Native `timeupdate`, unthrottled: about 4 Hz in Chrome.
  timeupdateMs: 250,

  parseUrl(url) {
    const [, , kind, id] = url.pathname.split("/"); // /embed/{movie|tv}/{id}
    const tmdbId = Number(id);
    const playable: Playable =
      kind === "movie"
        ? { kind: "movie", tmdbId }
        : {
            kind: "episode",
            tmdbId,
            season: Number(url.searchParams.get("s") ?? 1),
            episode: Number(url.searchParams.get("e") ?? 1),
          };
    return {
      playable,
      startAt: Number.parseFloat(url.searchParams.get("t") ?? "0") || 0,
      autoplay: url.searchParams.get("autoplay") !== "false",
    };
  },

  receive(data, video, reply) {
    const message = data as { type?: unknown; command?: unknown; args?: unknown[] };
    if (message?.type !== "cinesrc:command") return;
    const args = message.args ?? [];
    switch (message.command) {
      case "play":
        return video.play();
      case "pause":
        return video.pause();
      case "seek":
        return video.seek(Number(args[0]));
      case "setPlaybackRate":
        return video.setRate(Number(args[0]));
      case "getCurrentTime":
        return reply({ type: "cinesrc:response", command: "getCurrentTime", result: video.position });
      case "getPaused":
        return reply({ type: "cinesrc:response", command: "getPaused", result: video.paused });
      case "getPlaybackRate":
        return reply({ type: "cinesrc:response", command: "getPlaybackRate", result: video.rate });
      case "getDuration":
        return reply({ type: "cinesrc:response", command: "getDuration", result: video.duration });
    }
  },

  message(event, video) {
    const type = `cinesrc:${event}`;
    switch (event) {
      case "seeking":
      case "seeked":
      case "timeupdate":
        return { type, currentTime: video.position, duration: video.duration };
      case "ratechange":
        return { type, playbackRate: video.rate };
      case "volumechange":
        return { type, volume: video.volume, muted: false };
      case "unavailable":
        // "The video is unavailable on every server we tried.", shown in the player; nothing is posted.
        return null;
      default:
        return { type };
    }
  },

  readySignal(video) {
    return cinesrc.message("ready", video);
  },

  // `autonext=false` turns off the automatic next episode only: the episode list and next button stay.
  episodeChosen({ season, episode }) {
    return { type: "cinesrc:nextepisode", season, episode, internalNavigation: true, source: "episode-selector" };
  },
};

/**
 * VidFast, after https://vidfast.vc/ (November 2026). Its player posts no
 * "ready" and no "error", has no speed command, and answers `getStatus`
 * with a "playerstatus" event. The undocumented `{ event: "status", data }`
 * messages say whether a server has the Title (200) or none does (404).
 */
const vidfast: Dialect = {
  // VidFast throttles its "timeupdate" to about one a second.
  timeupdateMs: 1000,

  parseUrl(url) {
    const [, kind, id, season, episode] = url.pathname.split("/"); // /movie/{id} or /tv/{id}/{season}/{episode}
    const tmdbId = Number(id);
    const playable: Playable =
      kind === "movie"
        ? { kind: "movie", tmdbId }
        : { kind: "episode", tmdbId, season: Number(season), episode: Number(episode) };
    return {
      playable,
      // Without startAt VidFast resumes where it saved progress itself; this fake player has none saved.
      startAt: Number.parseFloat(url.searchParams.get("startAt") ?? "0") || 0,
      autoplay: url.searchParams.get("autoPlay") === "true",
    };
  },

  receive(data, video, reply) {
    const message = data as { command?: unknown; time?: unknown; level?: unknown };
    switch (message?.command) {
      case "play":
        return video.play();
      case "pause":
        return video.pause();
      case "seek":
        // The docs: "Seek commands accept time in seconds (integer values)".
        if (Number.isInteger(message.time)) video.seek(message.time as number);
        return;
      case "volume":
        return video.setVolume(Number(message.level));
      case "getStatus":
        return reply(vidfastPlayerEvent("playerstatus", video));
    }
  },

  message(event, video) {
    switch (event) {
      case "ready":
        return { event: "status", data: 200 };
      case "unavailable":
        return { event: "status", data: 404 };
      case "play":
      case "pause":
      case "seeked":
      case "timeupdate":
      case "ended":
        return vidfastPlayerEvent(event, video);
      default:
        // No "seeking", "ratechange" or "volumechange" events.
        return null;
    }
  },

  readySignal(video) {
    return vidfastPlayerEvent("playerstatus", video);
  },
};

function vidfastPlayerEvent(event: string, video: FakeVideo) {
  const { playable } = video;
  return {
    type: "PLAYER_EVENT",
    data: {
      event,
      currentTime: video.position,
      duration: video.duration,
      tmdbId: playable.tmdbId,
      mtmdbId: playable.tmdbId,
      mediaType: playable.kind === "movie" ? "movie" : "tv",
      season: playable.kind === "episode" ? playable.season : null,
      episode: playable.kind === "episode" ? playable.episode : null,
      playing: !video.paused,
      muted: false,
      volume: video.volume,
    },
  };
}

/** Every Syncable Source with an adapter has a fake player here. */
const DIALECTS: Record<AdaptedSourceId, Dialect> = { cinesrc, vidfast };

const MOVIE_SECONDS = 2.5 * 3600;
const EPISODE_SECONDS = 50 * 60;
const DEFAULT_LOAD_MS = 1500;

/** The iframe of a Watch Party player on a device whose clock is `clock`. */
export function createFakeFrame(clock: Clock, options: FakePlayerOptions = {}): FakeFrame {
  const listeners = new Set<(origin: string, data: unknown) => void>();
  let current: { player: FakeSourcePlayer; receive(data: unknown, targetOrigin: string): void; stop(): void } | null =
    null;
  /** Whether the Viewer has clicked in the page, which `blocksPlayUntilClick` waits for. */
  let clicked = false;

  /** postMessage is asynchronous, and the receiver gets a structured clone. */
  function later(deliver: () => void) {
    clock.setTimeout(deliver, 0);
  }

  function open(url: URL) {
    const source = Object.entries(DIALECTS).find(([id]) => getSource(id as SourceId).origins.includes(url.origin));
    if (!source) throw new Error(`No fake player for ${url.origin}`);
    const [sourceId, dialect] = source as [SourceId, Dialect];
    const asked = dialect.parseUrl(url);
    const { startAt, autoplay } = asked;
    let playable = asked.playable;
    const duration = playable.kind === "movie" ? MOVIE_SECONDS : EPISODE_SECONDS;
    let ready = false;
    let stopped = false;
    let paused = true;
    let rate = 1;
    let volume = 1;
    // The position is `base` at `since`, and moves on from there while playing.
    let base = startAt;
    let since = clock.now();
    let ticker: unknown = null;
    let loading: unknown = null;
    /** While a seek buffers (`seekMs`): the timer that ends it. The video stands still meanwhile. */
    let seeking: unknown = null;
    /** While the stream stalls (`stall`): the timer that ends it. The video stands still meanwhile. */
    let stalled: unknown = null;

    function postToSite(origin: string, data: unknown) {
      if (data === null) return;
      const copy = structuredClone(data);
      later(() => {
        if (current?.player !== player) return;
        for (const listener of [...listeners]) listener(origin, copy);
      });
    }

    function post(event: VideoEvent) {
      postToSite(url.origin, dialect.message(event, video));
    }

    function settle() {
      base = video.position;
      since = clock.now();
    }

    function tick() {
      ticker = clock.setTimeout(() => {
        // A seeking or stalled video's time does not move, so it reports none (a seek's comes with "seeked").
        if (seeking === null && stalled === null) post("timeupdate");
        tick();
      }, dialect.timeupdateMs);
    }

    function stopTicking() {
      if (ticker !== null) clock.clearTimeout(ticker);
      ticker = null;
    }

    /** While it plays: the timer that stops the video at the end of the Title. */
    let ending: unknown = null;

    /** (Re)sets the end of playback, after anything that moves it. */
    function watchForTheEnd() {
      if (ending !== null) clock.clearTimeout(ending);
      ending = null;
      if (paused || seeking !== null) return;
      ending = clock.setTimeout(() => {
        ending = null;
        // Like a <video>: at the end it pauses, says so, then says it ended.
        settle();
        paused = true;
        stopTicking();
        post("pause");
        post("ended");
      }, ((duration - video.position) / rate) * 1000);
    }

    const video: FakeVideo = {
      playable,
      get paused() {
        return paused;
      },
      get position() {
        const elapsed = paused || seeking !== null || stalled !== null ? 0 : ((clock.now() - since) / 1000) * rate;
        return Math.min(duration, base + elapsed);
      },
      get rate() {
        return rate;
      },
      get volume() {
        return volume;
      },
      duration,
      play() {
        if (!paused) return;
        settle();
        paused = false;
        post("play");
        tick();
        watchForTheEnd();
      },
      pause() {
        if (paused) return;
        settle();
        paused = true;
        stopTicking();
        watchForTheEnd();
        post("pause");
      },
      seek(position) {
        if (!Number.isFinite(position)) return;
        post("seeking");
        base = Math.max(0, Math.min(duration, position));
        since = clock.now();
        if (seeking !== null) clock.clearTimeout(seeking);
        seeking = null;
        if (!options.seekMs) {
          post("seeked");
          watchForTheEnd();
          return;
        }
        seeking = clock.setTimeout(() => {
          seeking = null;
          since = clock.now();
          post("seeked");
          watchForTheEnd();
        }, options.seekMs);
        watchForTheEnd();
      },
      setRate(next) {
        // Like a <video>: "ratechange" only when the rate changes.
        if (!Number.isFinite(next) || next <= 0 || next === rate) return;
        settle();
        rate = next;
        post("ratechange");
        watchForTheEnd();
      },
      setVolume(next) {
        if (!Number.isFinite(next) || next < 0 || next > 1 || next === volume) return;
        volume = next;
        post("volumechange");
      },
    };

    /** The Viewer's hand on the player's own controls. */
    function press(action: () => void) {
      if (!ready) throw new Error("The Viewer pressed a control before the player was ready.");
      action();
    }

    /** Whether the browser lets the player start with sound when the site asks it to. */
    function mayStart() {
      return !options.blocksPlayUntilClick || clicked;
    }

    /** The video as the site's commands reach it: a play the browser refuses does nothing at all. */
    const commanded: FakeVideo = Object.create(video, {
      play: {
        value() {
          if (mayStart()) video.play();
        },
      },
    });

    const controls: FakePlayerControls = {
      // A press inside the player is a click the browser lets start it.
      play: () =>
        press(() => {
          clicked = true;
          video.play();
        }),
      pause: () => press(() => video.pause()),
      seek: (position) => press(() => video.seek(position)),
      setSpeed: (next) => press(() => video.setRate(next)),
      setVolume: (next) => press(() => video.setVolume(next)),
      chooseEpisode: (episode) =>
        press(() => {
          const chosen = dialect.episodeChosen?.(episode);
          if (!chosen || playable.kind !== "episode") throw new Error(`${sourceId}'s player has no episode list here.`);
          // It navigates inside the iframe and plays the episode from its start.
          playable = { ...playable, ...episode };
          base = 0;
          since = clock.now();
          watchForTheEnd();
          postToSite(url.origin, chosen);
        }),
    };

    const player: FakeSourcePlayer = {
      sourceId,
      get playable() {
        return playable;
      },
      get ready() {
        return ready;
      },
      get paused() {
        return paused;
      },
      get position() {
        return video.position;
      },
      get rate() {
        return rate;
      },
      get volume() {
        return volume;
      },
      duration,
      controls,
      stall(ms) {
        if (!ready) throw new Error("A stream can only stall once the player is ready.");
        settle();
        if (stalled !== null) clock.clearTimeout(stalled);
        stalled = clock.setTimeout(() => {
          stalled = null;
          since = clock.now();
        }, ms);
      },
      skip(seconds) {
        if (!ready) throw new Error("A stream can only skip once the player is ready.");
        base = Math.min(duration, video.position + seconds);
        since = clock.now();
        watchForTheEnd();
      },
      postReadyFrom(origin) {
        postToSite(origin, dialect.readySignal(video));
      },
    };

    if (!appliesTo(options.hangs, sourceId, playable)) {
      loading = clock.setTimeout(() => {
        loading = null;
        if (appliesTo(options.unavailable, sourceId, playable)) {
          post("unavailable");
          return;
        }
        ready = true;
        settle();
        post("ready");
        if (autoplay && !options.noAutoplay && mayStart()) video.play();
      }, options.loadMs ?? DEFAULT_LOAD_MS);
    }

    return {
      player,
      receive(data: unknown, targetOrigin: string) {
        if (stopped || !ready) return; // The players only listen once ready.
        if (targetOrigin !== "*" && targetOrigin !== url.origin) return;
        dialect.receive(data, commanded, (answer) => postToSite(url.origin, answer));
      },
      stop() {
        stopped = true;
        stopTicking();
        if (loading !== null) clock.clearTimeout(loading);
        if (seeking !== null) clock.clearTimeout(seeking);
        if (stalled !== null) clock.clearTimeout(stalled);
        if (ending !== null) clock.clearTimeout(ending);
      },
    };
  }

  return {
    get player() {
      return current?.player ?? null;
    },

    click() {
      clicked = true;
    },

    load(url) {
      current?.stop();
      current = open(new URL(url));
    },

    post(message, targetOrigin) {
      const target = current;
      const copy = structuredClone(message);
      later(() => {
        if (current === target) target?.receive(copy, targetOrigin);
      });
    },

    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    remove() {
      current?.stop();
      current = null;
      listeners.clear();
    },
  };
}

function appliesTo(option: ForSources | undefined, source: SourceId, playable: Playable) {
  if (typeof option === "function") return option(source, playable);
  return option === true || (Array.isArray(option) && option.includes(source));
}

/**
 * Whether the player of `source` keeps its own episode list (or next-episode
 * button) in a Watch Party, so `controls.chooseEpisode` works there.
 */
export function playerHasOwnEpisodeList(source: AdaptedSourceId): boolean {
  return DIALECTS[source].episodeChosen !== undefined;
}

/** The Syncable Sources that have a fake player, i.e. every one with an adapter. */
export function fakePlayerSources(): AdaptedSourceId[] {
  return Object.keys(DIALECTS) as AdaptedSourceId[];
}
