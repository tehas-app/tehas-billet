import { createRequire } from "node:module"

// scripts/worktree-setup.sh builds this file from crates/example.
const addon = createRequire(import.meta.url)("../../../crates/example/example.node") as {
  wordCount(text: string): number
}

export const wordCount = (text: string): number => addon.wordCount(text)
