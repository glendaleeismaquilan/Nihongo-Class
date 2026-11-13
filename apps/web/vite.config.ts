import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => {
  // A site built without its API address would quietly call localhost.
  if (command === "build" && !loadEnv(mode, process.cwd()).VITE_API_URL) {
    console.warn("! VITE_API_URL is empty: set it in apps/web/.env.production to the deployed API's address.");
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon-64.png", "apple-touch-icon.png", "logo-128.webp", "logo-256.webp"],
        manifest: {
          name: "Nihongo Class",
          short_name: "Nihongo",
          description: "Study Japanese with your class or on your own, from N5 to N1.",
          lang: "en",
          start_url: "/",
          scope: "/",
          display: "standalone",
          theme_color: "#2A4A7F",
          background_color: "#FFFFFF",
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // §14 PWA: precache the app shell and static assets only.
          globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
          // Install icons are fetched by the browser itself; no need to precache them.
          globIgnores: ["**/pwa-*.png", "**/apple-touch-icon.png"],
          navigateFallback: "/index.html",
          // Never serve the payment return page or API paths from the cache.
          navigateFallbackDenylist: [/^\/api\//, /^\/payments\/[^/]+\/return/, /^\/dev\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-css" },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-files",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173 },
    resolve: {
      // Dedupe to guarantee one React copy — stops the "Cannot read properties of
      // undefined (reading 'S')" when React and react-dom disagree on symbols.
      dedupe: ["react", "react-dom", "scheduler"],
    },
    build: {
      target: "es2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
            "vendor-react": ["react", "react-dom", "react-router", "scheduler", "@tanstack/react-query"],
          },
        },
      },
    },
  };
});
