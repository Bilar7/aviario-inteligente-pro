import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  cacheDir: ".vite-cache-v8535",
  server: {
    host: "127.0.0.1",
    port: 5641,
    strictPort: true,
    hmr: { host: "127.0.0.1", port: 5641 }
  },
  preview: {
    host: "127.0.0.1",
    port: 5641,
    strictPort: true
  },
  optimizeDeps: {
    include: ["alpinejs", "firebase/app", "firebase/auth", "firebase/firestore", "xlsx"]
  },
  build: { target: "es2022", sourcemap: false }
});
