export default defineEventHandler((event) => {
  appendResponseHeader(
    event,
    "set-cookie",
    useViewerSignIn().signOut({ host: getRequestHost(event) }),
  );
  return { signedOut: true };
});
