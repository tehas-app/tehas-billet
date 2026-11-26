import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vitest/config"

// The web package's JSX compiles one way for the DOM and another for the
// server, and the Solid plugin picks by the environment a project names, so
// each gets a project of its own.
export default defineConfig({
  test: {
    execArgv: ["--disable-warning=ExperimentalWarning"],
    projects: [
      { extends: true, test: { name: "server", include: ["packages/{api,server}/**/*.test.ts"] } },
      {
        extends: true,
        plugins: [solid({ ssr: true })],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["packages/web/test/**/*.test.tsx"],
          exclude: ["packages/web/test/server.test.tsx"]
        }
      },
      {
        extends: true,
        plugins: [solid({ ssr: true })],
        test: { name: "web-server", environment: "node", include: ["packages/web/test/server.test.tsx"] }
      }
    ]
  }
})
