import { auth } from "~/lib/auth";
import type { H3Event } from "h3";

export async function getAuthSession(event: H3Event) {
  return await auth.api.getSession({
    headers: event.headers,
  });
}

export async function requireAuthSession(event: H3Event) {
  const session = await getAuthSession(event);
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  }
  return session;
}
