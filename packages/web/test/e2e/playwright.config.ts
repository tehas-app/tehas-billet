import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  outputDir: "../../../../node_modules/.cache/playwright",
  reporter: "line",
  workers: 1,
  use: { browserName: "chromium", headless: true }
})
