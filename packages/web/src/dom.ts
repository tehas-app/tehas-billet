// The web layer's own rendering: no framework, and the file a project copied
// from the billet owns and edits, as packages/web/src/route.tsx is today.
//
// Three pieces. `h` turns JSX into real DOM nodes. AtomElement uses the
// platform's own lifecycle in place of hooks. `patch` is the reconciler, and it
// exists for one reason: replacing a view's children wholesale passes every
// content test while it moves focus to <body>, which is a keyboard and screen
// reader failure. See packages/web/test/dom.test.ts.
import { Effect } from "effect"
import { type AsyncResult, type Atom, AtomRegistry } from "effect/reactivity"

export type Child = Node | string | number | boolean | null | undefined | ReadonlyArray<Child>

type Props<E> = Partial<Omit<E, "children" | "role">> & { readonly role?: string; readonly children?: Child }

declare global {
  // JSX is the one thing here a browser does not do natively. It stays because
  // tsc checks the tags and the props against HTMLElementTagNameMap, which a
  // tagged `html` template would not. See jsxFactory in packages/web/tsconfig.json.
  namespace JSX {
    type Element = Node
    type IntrinsicElements = { [T in keyof HTMLElementTagNameMap]: Props<HTMLElementTagNameMap[T]> }
  }
  interface HTMLElementTagNameMap {
    "billet-app": BilletApp
    "atom-view": AtomView<unknown>
  }
}

// What a node was made from, so a later render can tell an unchanged node from a
// lookalike. An element matches only when the same inputs produced it, which is
// what keeps a kept node's handlers honest: same inputs, same handler, correct.
interface MadeFrom {
  readonly tag: unknown
  readonly props: Record<string, unknown> | null
  readonly children: Array<Child>
}

const madeFrom = new WeakMap<Node, MadeFrom>()

// A prop h cannot set as a DOM property, either because the browser will not let
// it (addEventListener is not writable, so assigning to it throws) or because a
// function is always a handler here and never data.
const isHandlerProp = (name: string) => name.startsWith("on") && name.length > 2

// The properties that would let a prop parse markup or erase what patch built.
// A billet is copied and its call sites change, so the primitive has to refuse
// these and not rely on nobody passing them.
const FORBIDDEN_PROPS = new Set(["innerHTML", "outerHTML", "textContent", "innerText", "style"])

// JSX writes className and htmlFor; the DOM has class and for. Normalising here
// keeps one spelling of the truth in the DOM, so a reused node cannot keep a
// class from an earlier render because the two spellings raced.
const ATTRIBUTE_NAMES: Record<string, string> = { className: "class", htmlFor: "for" }

// The DOM property is all lowercase (onsubmit), but a view may write onSubmit as
// JSX does. A name already in the DOM's own casing (onclick, onsubmit) is used as
// it stands, so nothing here guesses at a property the browser does not have.
const handlerNames = new Set(["onclick", "onsubmit", "oninput", "onchange", "onkeydown", "onkeypress", "onfocus", "onblur"])

const normalizeHandlerName = (name: string) => {
  const lowered = name.toLowerCase()
  return handlerNames.has(lowered) ? lowered : name
}

// Flattens what a render returned into the nodes a parent should hold, so a view
// can return an array, a nested array, or nothing at all. A repeated string is
// the same Text node, so a piece of text that did not change is not rebuilt.
const textCache = new Map<string, Text>()

const textNode = (value: string): Text => {
  const found = textCache.get(value)
  if (found !== undefined && found.isConnected === false) return found
  const made = new Text(value)
  textCache.set(value, made)
  return made
}

export const nodes = (child: Child): Array<Node | string> => {
  if (Array.isArray(child)) return child.flatMap(nodes)
  if (child === null || child === undefined || typeof child === "boolean") return []
  return [child instanceof Node ? child : textNode(String(child))]
}

// Text becomes a Text node and a prop a DOM property, so nothing here is ever
// parsed as HTML. A title of "<img src=x>" stays text. h also records what it
// made, which is how patch recognises its own work on a later render.
export const h = (
  tag: string | ((props: any) => Node),
  props: Record<string, unknown> | null,
  ...children: Array<Child>
): Node => {
  if (typeof tag === "function") return tag({ ...props, children })
  const element = document.createElement(tag) as HTMLElement & Record<string, unknown>
  for (const [key, value] of Object.entries(props ?? {})) {
    const name = ATTRIBUTE_NAMES[key] ?? key
    if (name === "children") continue
    if (FORBIDDEN_PROPS.has(name)) {
      throw new TypeError(`${tag} got the prop ${name}, which would let markup be parsed. Put text in a text node.`)
    }
    if (isHandlerProp(name) || typeof value === "function") {
      // A handler is a DOM event property (onclick), never a junk expando. Assign
      // it: the browser's own accessor already stores it and fires it. Defining an
      // own property over that inherited accessor would shadow the real handler
      // and nothing would ever fire.
      const on = isHandlerProp(name) ? normalizeHandlerName(name) : `on${name.toLowerCase()}`
      ;(element as any)[on] = value
    } else if (value === null || value === undefined || typeof value === "boolean") {
      if (value === false || value === null || value === undefined) element.removeAttribute(name)
      else element.setAttribute(name, "")
    } else if (name in element && name !== "addEventListener" && name !== "removeEventListener") {
      element[name] = value
    } else {
      element.setAttribute(name, String(value))
    }
  }
  element.append(...nodes(children))
  madeFrom.set(element, { tag, props, children })
  return element
}

export const Fragment = ({ children }: { readonly children?: Child }): Node => {
  const fragment = new DocumentFragment()
  fragment.append(...nodes(children))
  return fragment
}

// The registry belongs to the root element, so a test passes its own and two
// instances on one page do not share state.
export class BilletApp extends HTMLElement {
  #registry: AtomRegistry | undefined

  get registry(): AtomRegistry {
    if (this.#registry === undefined) this.#registry = AtomRegistry.make({ defaultIdleTTL: 400 })
    return this.#registry
  }

  set registry(registry: AtomRegistry) {
    this.#registry = registry
  }

  disconnectedCallback() {
    this.#registry?.dispose()
  }
}
customElements.define("billet-app", BilletApp)

// The platform's lifecycle is the whole component model: connected, then
// disconnected. Custom elements render into the light DOM, so style.css and the
// role queries in the tests keep working without Shadow DOM.
export abstract class AtomElement extends HTMLElement {
  #stops: Array<() => void> = []
  #connected = false

  get registry(): AtomRegistry {
    const host = this.closest("billet-app")
    if (host === null) throw new Error(`${this.tagName.toLowerCase()} is outside <billet-app>`)
    return host.registry
  }

  watch<A>(atom: Atom.Atom<A>, f: (value: A) => void) {
    this.#stops.push(this.registry.subscribe(atom, f, { immediate: true }))
  }

  // The promise settles when the mutation does, as useAtomSet's promise mode does.
  run<A, E, W>(atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>, value: W) {
    this.registry.set(atom, value)
    return Effect.runPromise(AtomRegistry.getResult(this.registry, atom, { suspendOnWaiting: true }))
  }

  abstract connected(): void

  // connectedCallback runs again whenever the element is re-attached, which patch
  // and a page change both cause. Building the view twice would double-bind its
  // handlers, so connected runs once per element.
  connectedCallback() {
    if (this.#connected) return
    this.#connected = true
    this.connected()
  }

  disconnectedCallback() {
    this.#connected = false
    this.#stops.splice(0).forEach((stop) => stop())
  }
}

const sameAs = (old: Node, node: Node): boolean => {
  if (old === node) return true
  if (node.nodeType === Node.TEXT_NODE) return old.nodeType === Node.TEXT_NODE && old.nodeValue === node.nodeValue
  const made = madeFrom.get(node)
  if (made === undefined || old.nodeType !== Node.ELEMENT_NODE) return false
  const previous = madeFrom.get(old)
  // The node was made by a previous render, so it is only the same row if the
  // same data produced it. isEqualNode alone would compare attributes and text
  // and miss the handler that closes over the row's data.
  if (previous !== undefined) return sameMadeFrom(previous, made)
  // Never made here, so nothing of ours can be stale inside it.
  return old.isEqualNode(node)
}

const sameMadeFrom = (a: MadeFrom, b: MadeFrom): boolean =>
  a.tag === b.tag && sameProps(a.props, b.props) && sameChildren(a.children, b.children)

const sameProps = (a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const key of keys) {
    if (key === "children") continue
    if (!sameValue(a?.[key], b?.[key])) return false
  }
  return true
}

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i])))

const sameChildren = (a: Array<Child>, b: Array<Child>): boolean => {
  const [left, right] = [nodes(a).map(asText), nodes(b).map(asText)]
  return left.length === right.length && left.every((x, i) => x === right[i])
}

const asText = (node: Node | string): Node | string => (typeof node === "string" ? node : nodeToKey(node))

// A shallow structural key of a node made by h, so children compare by what they
// were made from and not by walking live DOM.
const nodeToKey = (node: Node): string => {
  const made = madeFrom.get(node)
  if (made === undefined) return `${node.nodeType}:${node.nodeName}:${node.textContent ?? ""}`
  const props = Object.entries(made.props ?? {})
    .filter(([key]) => key !== "children")
    .map(([key, value]) => `${key}=${propKey(value)}`)
    .sort()
    .join(",")
  const children = nodes(made.children).map((child) => (typeof child === "string" ? child : nodeToKey(child))).join("")
  const tag = typeof made.tag === "function" ? made.tag.name : String(made.tag)
  return `<${tag} ${props}>${children}</${tag}>`
}

const propKey = (value: unknown): string => {
  if (typeof value === "function") return "fn"
  if (typeof value === "object" && value !== null) return "obj"
  return String(value)
}

// Reconcile the children of `parent` against `next`, keeping every node that did
// not change so focus, selection, caret position and an in-flight animation stay
// where they were. Custom elements are never reused: they hold their own state,
// and rebuilding one is what a view change asks for.
export const patch = (parent: Node, next: ReadonlyArray<Node | string>) => {
  const wanted = next.flatMap((node) =>
    typeof node === "string"
      ? [textNode(node)]
      : node instanceof DocumentFragment
        ? [...node.childNodes]
        : [node]
  )

  const spare = [...parent.childNodes]
  const kept: Array<Node> = []
  const taken = new Set<Node>()

  for (const node of wanted) {
    const isElement = node.nodeType === Node.ELEMENT_NODE
    const reusable = isElement && !node.nodeName.includes("-")

    let match = spare.findIndex((old) => !taken.has(old) && sameAs(old, node))
    if (match === -1 && isElement) {
      // Same tag, different content: keep the shell and fix what is inside it, so
      // a focus inside it survives an update of its text.
      match = reusable
        ? spare.findIndex((old) => !taken.has(old) && old.nodeName === node.nodeName && !old.nodeName.includes("-"))
        : -1
    }

    if (match === -1) {
      // A node made this render. Nothing else can claim it, and a node still held
      // elsewhere is copied rather than moved, so patch cannot lose a subtree.
      kept.push(node.parentNode === null ? node : node.cloneNode(true))
      continue
    }

    const [old] = spare.splice(match, 1) as [Node]
    taken.add(old)
    if (old !== node && isElement) {
      updateAttributes(old as Element, node as Element)
      copyProperties(old as HTMLElement, node as HTMLElement)
      // A form or an input keeps its own value, and a kept node must not show a
      // value from an earlier render. h sets these as properties, so patch copies
      // them too, but never over a value the person typed.
      copyFormProperties(old as HTMLElement, node as HTMLElement)
    }
    if (isElement) {
      patch(old, [...node.childNodes])
      const made = madeFrom.get(node)
      if (made !== undefined) madeFrom.set(old, made)
    }
    kept.push(old)
  }

  for (const old of spare) if (old.parentNode === parent) parent.removeChild(old)

  let cursor: Node | null = parent.firstChild
  for (const node of kept) {
    if (node === cursor) cursor = cursor.nextSibling
    else parent.insertBefore(node, cursor)
  }
}

// Sets what changed and removes what went away. A stale role="alert" is still
// announced as an alert, and a stale disabled keeps a button dead.
const updateAttributes = (old: Element, node: Element) => {
  for (const { name, value } of node.attributes) {
    if (old.getAttribute(name) !== value) old.setAttribute(name, value)
  }
  for (const { name } of [...old.attributes]) {
    if (!node.hasAttribute(name)) old.removeAttribute(name)
  }
}

// isEqualNode and attributes say nothing about properties, and h sets most props
// as properties. A kept node keeps the handler it was made with, so a row whose
// data changed must have the new node's handler copied onto it, or the row acts
// on the data it was first made with. Only event properties here, and never
// textContent or children: those belong to patch, which copies them node by node.
// An event listener added with addEventListener is not a property, so keeping a
// shell keeps the old listener. h attaches handlers as properties (see on* in
// h), which is what makes them copyable here, and is why views set onsubmit and
// onclick as props instead of calling addEventListener.
const EVENT_PROPS = [
  "onsubmit",
  "onclick",
  "oninput",
  "onchange",
  "onkeydown",
  "onkeypress",
  "onfocus",
  "onblur"
] as const

const copyProperties = (old: HTMLElement, node: HTMLElement) => {
  for (const name of [...EVENT_PROPS, ...Object.keys(node)]) {
    if (!isHandlerProp(name)) continue
    const next = (node as any)[name]
    if (next !== undefined && next !== (old as any)[name]) (old as any)[name] = next
  }
}

// hidden and disabled are properties, and isEqualNode cannot see a property, so a
// kept node would stay stuck disabled after a save, or stuck hidden after a save
// that failed. A field is different: its value belongs to the person, not the
// render. h can only set value as an attribute, which sets the field's *default*,,
// so a reused field keeps what was typed and a fresh one still gets the value
// from data. Never assign a kept field's value here, or every re-render would
// clear what someone is typing.
const copyFormProperties = (old: HTMLElement, node: HTMLElement) => {
  for (const name of ["disabled", "hidden", "checked", "selected", "required", "multiple"] as const) {
    if (name in node && (node as any)[name] !== (old as any)[name]) (old as any)[name] = (node as any)[name]
  }
  for (const name of ["src", "href", "alt", "placeholder"] as const) {
    if (name in node && (node as any)[name] !== (old as any)[name]) (old as any)[name] = (node as any)[name]
  }
}

class AtomView<A> extends AtomElement {
  atom!: Atom.Atom<A>
  render!: (value: A) => Child

  connected() {
    this.watch(this.atom, (value) => patch(this, nodes(this.render(value))))
  }
}
customElements.define("atom-view", AtomView)

// A piece of the page drawn again whenever its atom changes.
export const view = <A>(atom: Atom.Atom<A>, render: (value: A) => Child): Node => {
  const element = new AtomView<A>()
  element.atom = atom
  element.render = render
  return element
}


