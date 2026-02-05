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
            }
        });

        return {
            provide: {
                apiClient
            }
        }
    }
});
