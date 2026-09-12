import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";

/**
 * Ship MapLibre's web worker.
 *
 * MapLibre v6 moved the worker out of the main bundle into a sibling ES module
 * and resolves it at RUNTIME:
 *
 *   const t = url.endsWith("-dev.mjs") ? "maplibre-gl-worker-dev.mjs" : "maplibre-gl-worker.mjs";
 *   return new URL(`./${t}`, import.meta.url).href;
 *
 * Because the filename is assembled from a variable rather than written as a
 * literal `new URL("./x.mjs", import.meta.url)`, no bundler can see it. Rollup
 * therefore never emits the file, the built app requests
 * `/assets/maplibre-gl-worker.mjs`, gets a 404, and every MapLibre map spins
 * forever with no error in the page — the worker is where tiles are parsed, so
 * the canvas simply never receives anything to draw.
 *
 * This copies the worker and the shared chunk it imports into the assets
 * directory under their exact names, which is precisely where MapLibre's own
 * resolver looks, and serves them in dev where the same resolution happens out
 * of Vite's dependency cache.
 */
function maplibreWorker(): Plugin {
  const FILES = [
    "maplibre-gl-worker.mjs",
    "maplibre-gl-shared.mjs",
    "maplibre-gl-worker-dev.mjs",
    "maplibre-gl-shared-dev.mjs",
  ];
  const from = (f: string) =>
    path.resolve(import.meta.dirname, "node_modules/maplibre-gl/dist", f);
  let assetsDir = "assets";

  return {
    name: "maplibre-worker-asset",
    configResolved(cfg) { assetsDir = cfg.build.assetsDir || "assets"; },
    generateBundle() {
      for (const f of FILES) {
        // The name must not be hashed: MapLibre asks for it by literal name.
        this.emitFile({ type: "asset", fileName: `${assetsDir}/${f}`, source: readFileSync(from(f)) });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = (req.url ?? "").split("?")[0];
        const hit = FILES.find((f) => p.endsWith(`/${f}`));
        if (!hit) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(readFileSync(from(hit)));
      });
    },
  };
}

const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), maplibreWorker()],
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
