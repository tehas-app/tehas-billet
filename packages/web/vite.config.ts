import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// `npm run dev -w @billet/web` serves the page; the API stays on the server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080"
    }
  }
})
