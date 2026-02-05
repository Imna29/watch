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

  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL,
    },
  },
  routeRules: {
    '/': { redirect: { to: '/watch', statusCode: 301 } },
    '/watch/**': { prerender: false, ssr: false },
    '/login/**': { prerender: false, ssr: false },
    '/register/**': { prerender: false, ssr: false },
    '/gpt/**': { prerender: false, ssr: false },
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
