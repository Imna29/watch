<template>
    <div class="min-h-dvh">
        <Toast />
        <DynamicDialog />
        <ConfirmDialog></ConfirmDialog>
        <MiscLoadingIndicator></MiscLoadingIndicator>
        <NuxtLayout>
            <NuxtPage :keepalive="true" />
        </NuxtLayout>
        <Analytics />
    </div>
</template>

<script lang="ts" setup>
import { Analytics } from '@vercel/analytics/nuxt';
let swiperInitialized = false;
const initializeSwiper = async () => {
    if (!swiperInitialized) {
        const { register } = await import("swiper/element/bundle");
        register();
        swiperInitialized = true;
    }
};

onBeforeMount(() => {
    initializeSwiper();
});

const router = useRouter();
const { user } = useAuth();

watch(user, (user, prevUser) => {
    if (prevUser && !user) {
        // user logged out
        router.push("/watch");
    }
});


</script>
