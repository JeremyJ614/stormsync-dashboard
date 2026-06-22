import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy libs out of the main bundle so first paint ships less JS.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("leaflet")) return "leaflet";
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) return "charts";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react-vendor";
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: true,
  },
  preview: {
    port,
    host: true,
  },
});
