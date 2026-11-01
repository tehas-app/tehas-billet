import { expect, test } from "@playwright/test"
import { type ChildProcess, spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../..", import.meta.url))

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close(() => (address !== null && typeof address === "object" ? resolve(address.port) : reject()))
    })
  })

// The port opens before the handler attaches, and a request in that gap is never
// answered, so each try needs a timeout of its own.
const waitForHealth = async (base: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const answer = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) }).catch(() => undefined)
    if (answer?.ok === true) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the server did not answer /health")
}

let server: ChildProcess
let work: string
let base: string

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "billet-e2e-"))
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "packages/server/src/main.ts"],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATABASE_FILE: join(work, "e2e.db") },
      stdio: ["ignore", "ignore", "inherit"]
    }
  )
  await waitForHealth(base)
})

test.afterAll(() => {
  server.kill()
  rmSync(work, { recursive: true, force: true })
})

test("a note goes from the form to SQLite and back, with the word count from Rust", async ({ page }) => {
  await page.goto(base)
  await expect(page.getByText("No notes yet.")).toBeVisible()

  await page.getByLabel("New note").fill("ship the billet")
  await page.getByRole("button", { name: "Add" }).click()

  const row = page.getByRole("listitem").filter({ hasText: "ship the billet" })
  await expect(row).toBeVisible()
  await expect(row.getByText("3 words")).toBeVisible()
  await expect(page.getByLabel("New note")).toHaveValue("")

  await row.getByRole("link").click()
  await expect(page.getByRole("heading", { name: "ship the billet" })).toBeVisible()
  await expect(page).toHaveURL(/\/notes\/1$/)

  await page.reload()
  await expect(page.getByRole("heading", { name: "ship the billet" })).toBeVisible()
  await expect(page.getByText("3 words")).toBeVisible()
})

test("a note that does not exist is named on its page", async ({ page }) => {
  await page.goto(`${base}/notes/999`)
  await expect(page.getByText("There is no note 999.")).toBeVisible()
})
