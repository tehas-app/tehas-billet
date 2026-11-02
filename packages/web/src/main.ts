// The whole entry point: mount the root element and draw the page into it.
import { App } from "./App.ts"
import { patch } from "./dom.ts"
import "./style.css"

const root = document.querySelector("billet-app")
if (root === null) throw new Error("the page has no <billet-app>")
patch(root, App())
