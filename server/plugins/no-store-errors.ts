// Route-rule headers (e.g. the CDN cache-control on `/api/watch/**` in
// nuxt.config.ts) are set before the handler runs, so they also end up on
// error responses: a validation 400 or a TMDB 404/429 could be cached for an
// hour. Nitro runs `error` hooks before its error handler, and that handler
// keeps a cache-control header that is already set, so override it here.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (_error, { event }) => {
    if (!event || event.handled || getResponseStatus(event) < 400) return;
    setResponseHeader(event, "cache-control", "no-store");
  });
});
