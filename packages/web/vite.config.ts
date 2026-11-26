import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vite"

// One `vite build` makes two bundles. The client one holds the islands and the
// stylesheet, under fixed names that the server's pages link to. The server one
// renders those pages, and `packages/server/src/pages.ts` loads it.
export default defineConfig({
  plugins: [solid({ ssr: true })],
  builder: {},
  environments: {
    client: {
      build: {
        outDir: "dist/client",
        rollupOptions: {
          input: { main: "src/main.tsx", style: "src/style.css" },
          output: { entryFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" }
        }
      }
    },
    ssr: {
      build: {
        outDir: "dist/server",
        rollupOptions: { input: { server: "src/server.tsx" } }
      }
    }
  }
})
