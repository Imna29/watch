// The only API route open to signed-out visitors (see server/middleware/viewer.ts).
export default defineEventHandler(async (event) => {
  const { password } = await readValidatedBody(event, signInBodySchema.parse);

  const result = await useViewerSignIn().signIn(password, {
    // Behind the Caddy proxy (ADR 0003) the client's address arrives in X-Forwarded-For.
    clientAddress: getRequestIP(event, { xForwardedFor: true }),
    host: getRequestHost(event),
  });

  if (result.outcome === "signed-in") {
    appendResponseHeader(event, "set-cookie", result.setCookie);
    return { viewer: result.viewer };
  }

  if (result.retryAfterSeconds > 0) {
    setResponseHeader(event, "retry-after", result.retryAfterSeconds);
  }
  throw createError({
    statusCode: result.outcome === "too-many-attempts" ? 429 : 401,
    statusMessage:
      result.outcome === "too-many-attempts" ? "Too many wrong passwords" : "Unknown password",
    data: { retryAfterSeconds: result.retryAfterSeconds },
  });
});
