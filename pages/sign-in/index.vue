<script setup lang="ts">
import { pathAfterSignIn } from "~/utils/signIn";

const route = useRoute();
const password = ref("");
const errorMessage = ref("");
const { mutateAsync: signIn, isPending } = useSignIn();

async function submit() {
    errorMessage.value = "";
    try {
        await signIn(password.value);
        await navigateTo(pathAfterSignIn(route.query.redirect));
    } catch (error) {
        password.value = "";
        errorMessage.value = messageFor(error);
    }
}

function messageFor(error: unknown) {
    const { statusCode, response } = error as {
        statusCode?: number;
        response?: { headers: Headers };
    };
    const retryAfter = Number(response?.headers.get("retry-after") ?? 0);
    const wait = retryAfter > 0 ? ` Try again in ${formatWait(retryAfter)}.` : "";
    if (statusCode === 401) return `That password doesn't belong to Giorgi or Mariam.${wait}`;
    if (statusCode === 429) return `Too many wrong passwords.${wait}`;
    return "Could not sign in. Please try again.";
}

function formatWait(seconds: number) {
    if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
</script>

<template>
    <div class="m-auto pb-10 w-full max-w-sm px-4">
        <Card>
            <template #title>
                <span class="font-['Bebas_Neue'] text-4xl">IMNAFLIX</span>
            </template>
            <template #content>
                <form class="grid gap-4" @submit.prevent="submit">
                    <div class="grid gap-2">
                        <label for="password">Password</label>
                        <InputText id="password" v-model="password" type="password" autocomplete="current-password"
                            required autofocus />
                    </div>
                    <div v-if="errorMessage" class="text-sm text-red-500" role="alert">
                        {{ errorMessage }}
                    </div>
                    <Button type="submit" class="w-full" :loading="isPending" :disabled="!password">
                        Sign in
                    </Button>
                </form>
            </template>
        </Card>
    </div>
</template>
