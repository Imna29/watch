import { ofetch } from "ofetch";

export const tmdbFetch = ofetch.create({
  baseURL: "https://api.themoviedb.org/3",
  onRequest({ options }) {
    const config = useRuntimeConfig();
    const apiKey = process.env.TMDB_API_KEY || config.tmdbApiKey;
    if (apiKey) {
      options.headers.set("Authorization", `Bearer ${apiKey}`);
      options.headers.set("Accept", "application/json");
    }
  },
});
