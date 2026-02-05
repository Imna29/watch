<script setup lang="ts">
import { Plus, Check, LoaderCircle } from "lucide-vue-next";

const dialogRef: any = inject("dialogRef");
const props = ref<{
    contentId: number;
    contentType: "MOVIE" | "TV_SHOW"
} | null>(null);

const toast = useToast();

const { data: playlists, isPending: isLoadingPlaylists } = usePlaylists();
const { mutate: addToPlaylist, isPending, variables } = useAddToPlaylist();

function handleAddToPlaylist(playlistId: string) {
    if (!props.value) return;
    
    addToPlaylist({
        playlistId,
        contentId: props.value.contentId,
        contentType: props.value.contentType,
    }, {
        onSuccess: () => {
            toast.add({
                severity: "success",
                summary: "Added to playlist",
                detail: `The ${props.value!.contentType === "MOVIE" ? "movie" : "show"} has been added to your playlist`,
                life: 3000
            });
        },
    });
}

onMounted(() => {
    props.value = dialogRef.value.data;
})
</script>

<template>
    <div class="mt-2">
        <div v-if="isLoadingPlaylists" class="flex justify-center py-4">
            <LoaderCircle class="h-6 w-6 animate-spin" />
        </div>
        <div v-else class="mt-2">
            <div class="flex items-start flex-col gap-2">
                <div v-for="playlist in playlists" :key="playlist.id">
                    <div class="flex flex-row items-center gap-4">
                        <div class="flex-grow-0" @click="handleAddToPlaylist(playlist.id)">
                            <LoaderCircle v-if="
                                isPending &&
                                variables?.playlistId === playlist.id
                            " class="h-6 w-6 animate-spin" />
                            <Check v-else class="h-6 w-6" />
                        </div>
                        <div class="flex-grow flex-1">
                            <div class="text-lg font-bold">
                                {{ playlist.name }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
