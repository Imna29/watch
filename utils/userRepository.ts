import type {$Fetch, NitroFetchRequest} from "nitropack";
import type User from "~/models/apiModels/user/User";

export const userRepository = <T>(fetch: $Fetch<T, NitroFetchRequest>) => ({
    async getUser() {
        return fetch<User>("/user");
    },

});