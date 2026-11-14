import { useQueryClient } from "@tanstack/vue-query";
import { SIGN_IN_PATH, pathAfterSignIn, signInPathFrom } from "~/utils/signIn";

// Every page is for a signed-in Viewer except the sign-in page (ADR 0001).
// The server guard protects the data; this sends signed-out visitors to sign in.
export default defineNuxtRouteMiddleware(async (to) => {
    // Called before the first await, while the injection context is active.
    const queryClient = useQueryClient();
    const viewer = await queryClient.fetchQuery(viewerOptions.current());

    if (to.path === SIGN_IN_PATH) {
        return viewer ? navigateTo(pathAfterSignIn(to.query.redirect)) : undefined;
    }
    if (!viewer) {
        return navigateTo(signInPathFrom(to.fullPath));
    }
});
