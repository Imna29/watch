# Watch Parties run only on Syncable Sources

Every Source plays in a cross-origin iframe, so the site can only keep two players in step if the Source accepts play, pause and seek commands over `postMessage`. As of November 2026 none of the six original Sources do, while CineSrc and VidFast document two-way control, so Watch Parties use only those Syncable Sources (CineSrc first, VidFast as backup) and solo viewing keeps every Source. When no Syncable Source has a Title, the Viewers fall back to Tab Share over the Call.

## Considered Options

- **Loose sync** (both load any Source, a 3-2-1 countdown, manual correction when they drift): rejected because correcting by hand gets tiresome within one movie.
- **Tab Share only**: rejected as the default because the other Viewer gets compressed video limited by the sharer's upload speed, and sharing tab audio only works in desktop Chrome/Edge.
