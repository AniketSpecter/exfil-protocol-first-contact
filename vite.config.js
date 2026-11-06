import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: Number(process.env.EXFIL_DEV_PORT || 5173), strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 1600 },
});
