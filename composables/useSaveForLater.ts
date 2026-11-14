import { WatchPlaylistItemType, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";

export function useSaveForLater() {
  const toast = useToast();
  const addToSystemPlaylist = useAddToSystemPlaylist();

  return async function saveForLater(
    title: string,
    id: number,
    contentType: WatchPlaylistItemType,
  ) {
    try {
      await addToSystemPlaylist(WatchPlaylistType.WATCH_LATER, id, contentType);
      toast.add({
        severity: "success",
        summary: `${contentType === WatchPlaylistItemType.MOVIE ? "Movie" : "Show"} saved for later`,
        detail: `${title} has been saved for later`,
        life: 3000,
      });
    } catch (error) {
      console.error("Failed to save for later", error);
      toast.add({
        severity: "error",
        summary: "Could not save",
        detail: `${title} could not be saved for later. Please try again.`,
        life: 4000,
      });
    }
  };
}
