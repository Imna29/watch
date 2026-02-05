import type User from "~/models/apiModels/user/User";

export const useUserStore = defineStore('userStore', () => {
    const {$apiClient} = useNuxtApp();
    const userRepo = userRepository($apiClient);

    async function getUser(): Promise<User> {
        return userRepo.getUser();
    }


    return {
        getUser,
    }
});