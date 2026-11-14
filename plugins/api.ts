import { API_BASE, lostSignIn, signInPathFrom } from "~/utils/signIn";

export default defineNuxtPlugin({
    parallel: true,
    setup() {
        const isLoading = useIsLoading();
        const apiClient = $fetch.create({
            baseURL: API_BASE,
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
                const url = typeof request === "string" ? request : request.url;
                if (!lostSignIn(new URL(url, window.location.origin).pathname, response)) return;
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
