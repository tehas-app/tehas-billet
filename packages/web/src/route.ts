// Routing without a router library. The address bar is the only state, so a link
// stays an <a> that the app intercepts, and back and forward work because that is
// what popstate already does.
import { AtomElement, type Child, Fragment, h, nodes, patch } from "./dom.ts"

const listeners = new Set<() => void>()

const refresh = () => {
  for (const listener of [...listeners]) listener()
}

// One listener for the whole page, so the page is redrawn once per navigation and
// not once per view that happens to be open.
window.addEventListener("popstate", refresh)

export const navigate = (path: string) => {
  window.history.pushState(null, "", path)
  refresh()
}

// A link is a link. Middle click, cmd-click and "copy link address" keep working,
// because the default is prevented only for a plain left click.
export const Link = (props: { readonly href: string; readonly children?: Child }) =>
  h("a", {
    href: props.href,
    onclick: (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(props.href)
    },
  }, props.children)

// A custom element carries state no other node can take over (the address it draws,
// the listener it holds), so it is matched by identity and built only by h — which is
// what AtomElement marks. Its own connected has nothing to build: the element places
// its own page, because patch only touches children once a node is in the page, and
// the browser upgrades an element the moment it is placed.
class PathView extends AtomElement {

  // The render is handed over before the element is connected, because a custom
  // element's constructor may not take arguments.
  render: (path: string) => Child = () => null
  // The element draws itself when the address changes, instead of registering a
  // callback somewhere it does not own. patch and a page change both detach and
  // re-attach elements, and a callback kept in a set the element cannot reach would
  // keep redrawing the live page from an element the page has retired: a link would
  // change the address bar and leave what the person sees alone.
  #onPath = () => {
    if (this.isConnected) patch(this, nodes(this.render(window.location.pathname)))
  }

  // The page is placed by patch, so the element has nothing to build the first time
  // it is in the page; what it has to do is hear about the address, which is the only
  // thing that can change what it shows.
  connected(): void {
    listeners.add(this.#onPath)
    // The page is not placed by h (a route hands over a builder, so the element is
    // made at the moment it is put in the page) and not by patch before it is in the
    // page (which is when the browser upgrades it). So the element places its own
    // page, here, which is also the first moment it can ask the registry anything.
    patch(this, nodes(this.render(window.location.pathname)))
  }

  // The page was put back: the address may have moved while it was out, and an
  // element that stayed quiet would go on showing the page that was here before.
  override reattached(): void {
    patch(this, nodes(this.render(window.location.pathname)))
  }

  disconnectedCallback() {
    listeners.delete(this.#onPath)
  }
}
customElements.define("path-view", PathView)

// A builder, not the element: h builds one per render, so patch is never handed an
// element the page already holds, and a slot that needs its own gets a fresh one
// that hears about the address as soon as it is in the page.
export const onPath = (render: (path: string) => Child) => () => h(PathView, { render })

export { Fragment }
