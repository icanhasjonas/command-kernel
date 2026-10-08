import { cloudflare } from "@cloudflare/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone app. Own dev server, own deps. Port in the 4000-4999 lab range.
// cloudflare(): the real Workers runtime behind `vite dev` (the lab's Durable Object,
// /api/* and /ws), and a deployable build of worker/index.ts next to the page.
export default defineConfig({
  plugins: [react(), tailwind(), cloudflare()],
  server: {
    port: Number(process.env.PORT) || 4319,
    strictPort: false,
  },
});
