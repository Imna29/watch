import { signInPathFrom } from "~/utils/signIn";

// Answered 401 on purpose: a wrong password, or "nobody signed in" while the
// route guard asks who is.
const SIGN_IN_REQUESTS = ["/sign-in", "/sign-out", "/viewer"];

export default defineNuxtPlugin({
    parallel: true,
    setup() {
        const isLoading = useIsLoading();
        const apiClient = $fetch.create({
            baseURL: "/api",
            credentials: "include",
            onRequest: context => {
                isLoading.value = true;
            },
            onResponse: context => {
                isLoading.value = false;
            },
            onResponseError: ({ request, response }) => {
                // The sign-in cookie stopped working (expired, or this Viewer's
                // password changed): start over from the sign-in page, with a
                // full page load so nothing from before stays in memory.
                if (response.status !== 401) return;
                const url = typeof request === "string" ? request : request.url;
                const path = new URL(url, window.location.origin).pathname;
                if (SIGN_IN_REQUESTS.some((signInRequest) => path.endsWith(signInRequest))) return;
                window.location.assign(
                    signInPathFrom(window.location.pathname + window.location.search),
                );
            },
        });

        return {
            provide: {
                apiClient
            }
        }
    }
});
