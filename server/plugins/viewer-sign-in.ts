// The startup check: create the Viewer sign-in now, so the server refuses to
// start (instead of failing the first sign-in) when a password hash or the
// cookie secret is missing, or both Viewers have the same password hash.
export default defineNitroPlugin(() => {
  useViewerSignIn();
});
