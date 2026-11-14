# Watch

A private site where Giorgi and Mariam find movies and TV shows and watch them, alone or together in sync.

## People

**Viewer**:
Giorgi or Mariam, the only two people who can use the site. Each signs in with their own password.
_Avoid_: User, member, account

**Device**:
One browser tab where a Viewer has the site open, holding one realtime connection at a time. It stays the same Device when it reconnects or the page reloads. A Viewer can have several at once.
_Avoid_: Client, session, connection

## Watching

**Title**:
A movie or TV show, identified by its TMDB id.
_Avoid_: Content, item, media

**Source**:
A third-party embed provider that streams a Title inside the player.
_Avoid_: Server, provider, mirror

**Syncable Source**:
A Source whose player accepts play, pause and seek commands from the site. Only Syncable Sources can host a Watch Party.
_Avoid_: Controllable source

## Together

**Watch Party**:
One synced viewing of a Title by both Viewers, where play, pause and seek on either side apply to both.
_Avoid_: Room, session, sync

**Tab Share**:
The fallback way to hold a Watch Party when no Syncable Source has the Title: one Viewer plays any Source and shares the browser tab over the Call.
_Avoid_: Screen share, stream

**Call**:
The audio/video call between the two Viewers. It exists independently of any Watch Party.
_Avoid_: Video chat, meeting
