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
    "@vercel/analytics/nuxt",
  ],
  ssr: false,

  routeRules: {
    '/': { redirect: { to: '/watch', statusCode: 301 } },
    '/watch/**': { prerender: false, ssr: false },
    '/login/**': { prerender: false, ssr: false },
    '/register/**': { prerender: false, ssr: false },
    '/api/watch/**': {
      headers: {
        'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  },

  css: ["primeicons/primeicons.css", "~/assets/main.css"],

  app: {
    head: {
      htmlAttrs: {
        class: 'app-dark-mode'
      }
    }
  },
  primevue: {
    importTheme: { from: '~/themes/theme.js' }
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
