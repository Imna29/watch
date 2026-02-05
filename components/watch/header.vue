<script setup lang="ts">
import { Search, X, Menu } from "lucide-vue-next";

const watchStore = useWatchStore();
const route = useRoute();
const { loggedIn, signOut } = useAuth();

const handleSignOut = async () => {
    await signOut({
        redirectTo: "/login"
    });
};

const navItems = computed(() => {
    const items = [
        { to: "/watch", label: "Home" },
        { to: "/watch/movies", label: "Movies" },
        { to: "/watch/tvs", label: "TV Shows" },
    ];
    
    if (loggedIn.value) {
        items.push({ to: "/watch/playlist", label: "My lists" });
    }
    
    return items;
});

const isActiveRoute = (path: string) => route.path === path;
const isActiveExplore = () => route.name?.toString().includes("explore");


watch(route, () => {
    isDrawerOpen.value = false;
});

const popOver = ref();
const popOverProfile = ref();
const isDrawerOpen = ref(false);
</script>

<template>
    <div class="py-3 flex align-baseline">
        <span class="md:block hidden">
            <NuxtLink class="font-['Bebas_Neue'] text-4xl" to="/watch">IMNAFLIX</NuxtLink>
        </span>
        <div class="md:hidden">
            <Button outlined severity="secondary" class="p-2" @click="isDrawerOpen = !isDrawerOpen">
                <Menu />
            </Button>
        </div>

        <Drawer header="Navigation" v-model:visible="isDrawerOpen">
            <div class="grid gap-4 py-4">
                <nav class="flex flex-col space-y-4 text-lg">
                    <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" :class="{
                        'text-color-emphasis': isActiveRoute(item.to),
                        'text-muted-color hover:text-color-emphasis ease-in duration-100':
                            !isActiveRoute(item.to),
                    }">
                        {{ item.label }}
                    </NuxtLink>
                    <div :class="{
                        'text-color-emphasis': isActiveExplore(),
                        'text-muted-color hover:text-color-emphasis ease-in duration-100':
                            !isActiveExplore(),
                    }" class="cursor-pointer" @click="(event) => popOver.toggle(event)">
                        Explore
                    </div>
                    <Divider></Divider>
                    <NuxtLink v-if="!loggedIn" to="/login" class="text-muted-color hover:text-color-emphasis">Log In</NuxtLink>
                    <div v-else @click="handleSignOut" class="text-muted-color hover:text-color-emphasis cursor-pointer">Sign Out</div>
                    <Popover ref="popOver">
                        <div class="flex flex-col gap-2">
                            <div>
                                <NuxtLink :to="'/watch/explore/movies'">Movies</NuxtLink>

                            </div>
                            <div>
                                <NuxtLink :to="'/watch/explore/tv'">TV Shows</NuxtLink>
                            </div>
                        </div>
                    </Popover>
                </nav>
            </div>
        </Drawer>

        <nav class="md:flex hidden text-lg items-center md:space-x-8 md:ml-16">
            <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" :class="{
                'text-color-emphasis': isActiveRoute(item.to),
                'text-muted-color hover:text-color-emphasis ease-in duration-100':
                    !isActiveRoute(item.to),
            }">
                {{ item.label }}
            </NuxtLink>

            <div :class="{
                'text-color-emphasis': isActiveExplore(),
                'text-muted-color hover:text-color-emphasis ease-in duration-100':
                    !isActiveExplore(),
            }" class="cursor-pointer" @click="(event) => popOver.toggle(event)">
                Explore
            </div>
            <Popover ref="popOver">
                <div class="flex flex-col gap-2">
                    <div>
                        <NuxtLink :to="'/watch/explore/movies'">Movies</NuxtLink>

                    </div>
                    <div>
                        <NuxtLink :to="'/watch/explore/tv'">TV Shows</NuxtLink>
                    </div>
                </div>
            </Popover>
        </nav>

        <div class="relative w-full max-w-sm items-center ml-auto md:flex">
            <InputGroup class="w-full">

                <InputText id="search" type="text" placeholder="Search..." class="pl-10 w-full"
                    v-model="watchStore.searchQuery" />
                <Button icon="pi pi-times" severity="secondary" v-if="watchStore.isSearching"
                    @click="watchStore.clearSearch()" />
            </InputGroup>
        </div>

        <div class="md:flex hidden items-center md:ml-5 ml-2">
            <Avatar icon="pi pi-user" class="cursor-pointer" size="normal" shape="square"
                @click="(event: Event) => popOverProfile.toggle(event)"></Avatar>
        </div>
        <Popover ref="popOverProfile">
            <div class="flex flex-col gap-2">
                <div v-if="!loggedIn">
                    <NuxtLink to="/login" class="">Log In</NuxtLink>
                </div>
                <div v-else>
                    <div @click="handleSignOut" class="cursor-pointer">Sign Out</div>
                </div>
            </div>
        </Popover>
    </div>
</template>
