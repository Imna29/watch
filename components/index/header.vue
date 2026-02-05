<script setup lang="ts">
const { user, signOut } = useAuth();
</script>

<template>
    <header
        class="sticky top-0 h-16 m-2 items-center gap-4  px-4 md:px-6 w-100 bg-surface-50/10 flex rounded-xl">
        <div>
            <NuxtLink to="/" class="font-mono text-2xl logo">IMNA</NuxtLink>
        </div>
        <nav class="flex items-center space-x-4">
            <NuxtLink to="/watch" class="text-muted-color hover:text-color-emphasis
                 ease-in duration-100">Watch</NuxtLink>
            <NuxtLink to="/watch" class="text-muted-color hover:text-color-emphasis ease-in duration-100">Drive
            </NuxtLink>
            <NuxtLink to="/gpt" class="text-muted-color hover:text-color-emphasis ease-in duration-100">ImnaGPT
            </NuxtLink>
            <NuxtLink to="/login" class="text-muted-color hover:text-color-emphasis ease-in duration-100">Chat
            </NuxtLink>
        </nav>
        <ClientOnly>
            <div v-if="!user">
                <Button variant="outline" @click="navigateTo('/login')">Login</Button>
            </div>
            <div v-else>
                <Button variant="outline" @click="signOut()">Logout</Button>
            </div>
        </ClientOnly>

    </header>
</template>

<style scoped>
.logo {
    font-family: "Bebas Neue", monospace;
    letter-spacing: 0.1em;
}
</style>
