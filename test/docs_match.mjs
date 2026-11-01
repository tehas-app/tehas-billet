// The docs name paths and quote code. This fails when either stops being true,
// so a sample cannot drift from the file it came from. Needs node_modules.
import { existsSync, readFileSync } from "node:fs"

const docs = ["AGENTS.md", ".tehas/stack.md", ".agents/skills/effect/SKILL.md"]
const roots = /^(packages|node_modules|migrations|crates|scripts|test|preview|\.agents|\.tehas)\//
const guides = /^\d\d_[a-z-]+\//
const guideRoot = "node_modules/effect/ai-docs/src/"

let failed = false
const fail = (message) => {
  console.error(message)
  failed = true
}

for (const doc of docs) {
  const text = readFileSync(doc, "utf8")

  for (const [, path] of text.replace(/^```[\s\S]*?^```$/gm, "").matchAll(/`([^`\s]+)`/g)) {
    const file = guides.test(path) ? guideRoot + path : path
    if ((roots.test(file) || file.endsWith(".md")) && !existsSync(file)) fail(`${doc}: ${path} does not exist`)
  }

  for (const [, file, sample] of text.matchAll(/^```tsx? (\S+)\n([\s\S]*?)^```$/gm)) {
    if (!existsSync(file)) {
      fail(`${doc}: ${file} does not exist`)
      continue
    }
    const source = readFileSync(file, "utf8")
    for (const line of sample.split("\n")) {
      if (line.trim() !== "" && !source.includes(line)) fail(`${doc}: not in ${file}: ${line.trim()}`)
    }
  }
}

process.exit(failed ? 1 : 0)
