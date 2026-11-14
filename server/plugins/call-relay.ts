// The startup check: read the Call's relay config now, so the server refuses
// to start (instead of failing the first Call) when TURN_HOST and TURN_SECRET
// are half set or the relay address is malformed.
export default defineNitroPlugin(() => {
  useCallRelay();
});
