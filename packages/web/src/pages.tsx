import type { Note } from "@billet/api"
import { HydrationScript, type JSX } from "@solidjs/web"
import { Hydration, Show, useContext } from "solid-js"
import { RegistryContext } from "./atom.ts"
import { IslandRoot, type IslandName, wordsLabel } from "./islands.tsx"

// The pages. They render on the server only, inside `NoHydration`, so their
// markup reaches the browser and their code does not. An `Island` is the one
// part that hydrates.

function Island(props: { readonly name: IslandName }) {
  const registry = useContext(RegistryContext)
  return (
    <div data-island={props.name}>
      <Hydration id={props.name}>
        <IslandRoot name={props.name} registry={registry} />
      </Hydration>
    </div>
  )
}

// A page with islands loads the script that hydrates them. One without gets no
// script at all.
function Layout(props: { readonly title: string; readonly islands?: boolean; readonly children: JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/assets/style.css" />
        <Show when={props.islands}>
          <HydrationScript />
          <script type="module" src="/assets/main.js" />
        </Show>
      </head>
      <body>
        <main>
          <h1>Notes</h1>
          {props.children}
        </main>
      </body>
    </html>
  )
}

export function HomePage() {
  return (
    <Layout title="Notes" islands>
      <Island name="NoteForm" />
      <Island name="NoteList" />
    </Layout>
  )
}

export function NotePage(props: { readonly note: Note }) {
  return (
    <Layout title={props.note.title}>
      <a href="/">All notes</a>
      <h2>{props.note.title}</h2>
      <p>{wordsLabel(props.note.words)}</p>
    </Layout>
  )
}

export function MissingPage(props: { readonly message: string }) {
  return (
    <Layout title="Not found">
      <a href="/">All notes</a>
      <p role="alert">{props.message}</p>
    </Layout>
  )
}
