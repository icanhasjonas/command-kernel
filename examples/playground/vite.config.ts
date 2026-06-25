import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone app. Own dev server, own deps. Port in the 4000-4999 lab range.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: Number(process.env.PORT) || 4319,
    strictPort: false,
  },
});
