import tailwindcss from "@tailwindcss/vite";
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  modules: [
    "@primevue/nuxt-module",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@nuxt/fonts",
    "@vee-validate/nuxt",
  ],
  ssr: false,

  // Self-hosted (ADR 0003): a standalone server that runs on Bun.
  // Nitro's bun preset extends node-server and serves via Bun.serve.
  nitro: {
    preset: "bun",
    // The realtime connection (server/routes/realtime.ts).
    experimental: { websocket: true },
  },

  routeRules: {
    '/': { redirect: { to: '/watch', statusCode: 301 } },
    '/watch/**': { prerender: false, ssr: false },
    '/sign-in/**': { prerender: false, ssr: false },
    // Private: every API response is for a signed-in Viewer only (ADR 0001),
    // so no shared cache may keep one.
    '/api/watch/**': {
      headers: {
        'cache-control': 'private, max-age=3600',
      },
    },
  },

  css: ["primeicons/primeicons.css", "~/assets/main.css"],

  app: {
    head: {
      htmlAttrs: {
        class: 'app-dark-mode'
      },
      // A private site: keep it out of search engines (with public/robots.txt).
      meta: [{ name: 'robots', content: 'noindex, nofollow' }],
    }
  },
  primevue: {
    importTheme: { from: '~/themes/theme.js' }
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
