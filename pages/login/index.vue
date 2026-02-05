<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

definePageMeta({
  auth: {
    only: "guest"
  }
})

const { signIn } = useAuth();

const email = ref<string>("");
const password = ref<string>("");
const errorMessage = ref<string>("");

async function loginWithCredentials() {
  errorMessage.value = "";
  try {
    const { error } = await signIn.email({
      email: email.value,
      password: password.value,
    });

    if (error) {
      errorMessage.value = error.message || "An error occurred. Please try again.";
    } else {
      navigateTo("/watch");
    }
  } catch (err: any) {
    errorMessage.value = err.message || "An error occurred. Please try again.";
  }
}
</script>

<template>
  <div class="m-auto pb-10 w-fit">
    <NuxtLink to="/watch">
      <div class="flex">
        <ArrowLeft class="inline" />
        <div class="underline align-text-bottom">
          Watch
        </div>
      </div>
    </NuxtLink>
    <Card class="max-w-sm mt-1">
      <template #title>Login</template>
      <template #subtitle>Enter your email below to login to your account
      </template>

      <template #content>
        <form @submit.prevent="loginWithCredentials">
          <div class="grid gap-4">
            <div class="grid gap-2">
              <label for="email">Email</label>
              <InputText id="email" type="email" placeholder="imna@example.com" required v-model="email" />
            </div>
            <div class="grid gap-2">
              <div class="flex items-center">
                <label for="password">Password</label>
                <a href="#" class="ml-auto inline-block text-sm underline">
                  Forgot your password?
                </a>
              </div>
              <InputText id="password" type="password" required v-model="password" />
            </div>
            <div class="text-sm text-destructive" v-if="errorMessage">
              {{ errorMessage }}
            </div>
            <Button type="submit" class="w-full">
              Login
            </Button>
          </div>
        </form>
        <div class="mt-4 text-center text-sm">
          Don't have an account?
          <NuxtLink to="/register" class="underline">
            Sign up
          </NuxtLink>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped></style>
