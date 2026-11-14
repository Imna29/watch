import type { IceServersResponse } from "~/realtime/call/protocol";

// STUN and TURN for one of the Viewer's Call peer connections, with fresh
// relay credentials (CALL_ICE_SERVERS_PATH). Never cached: the credentials
// expire.
export default defineEventHandler((event): IceServersResponse => {
  const viewer = requireViewer(event);
  setResponseHeader(event, "cache-control", "no-store");
  return { iceServers: useCallRelay().iceServersFor(viewer) };
});
