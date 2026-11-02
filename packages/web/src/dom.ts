// The web layer's own rendering: no framework, and the file a project copied
// from the billet owns and edits, as packages/web/src/route.ts is today.
//
// Three pieces. `h` builds real DOM nodes from a tag, its props and its children.
// `AtomElement` is the base a component that reads an atom extends, using the
// platform's own lifecycle in place of hooks. `patch` is the reconciler, and it
// exists for one reason: replacing a view's children wholesale passes every
// content test while it moves focus to <body>, which is a keyboard and screen
// reader failure. See packages/web/test/dom.test.ts.
import { Cause, Effect } from "effect"
import * as AtomRegistryNS from "effect/reactivity/AtomRegistry"
import { AsyncResult, Atom } from "effect/reactivity"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => Child)
  | ReadonlyArray<Child>

declare global {
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
  // How to build another element of the same kind. Only h sets it, because only h
  // knows what the element was made from, and only h may build one: a custom element
  // has to carry what it watches before the browser upgrades it, which happens the
  // moment it is placed, so patch cannot build these itself.
  build?: (children: Array<Child>) => HTMLElement
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

// A fresh Text node every time. A cache would hand the page a Text node the browser is
// already showing somewhere else, and appending it would move it out of that place:
// two "Notes" headings on one page would turn out to be the same node, and only the
// page that placed it last would keep it.
const textNode = (value: string): Text => new Text(value)

export const nodes = (child: Child): Array<Node> => {
  if (Array.isArray(child)) return child.flatMap(nodes)
  if (child === null || child === undefined || typeof child === "boolean") return []
  // A builder called here, at the place the child is placed, so an element built to
  // go into the page has not been in one before — which is what lets a custom element
  // watch its atom the moment the browser upgrades it, and what keeps a render from
  // handing back a node the page is already showing. A class is a tag, not a builder:
  // h builds it, which is the only way an element can carry what it watches before the
  // browser upgrades it, and the only way it records what it was made from.
  if (typeof child === "function")
    return nodes(child.prototype instanceof HTMLElement ? h(child as unknown as new () => HTMLElement, null) : (child as () => Child)())
  return [child instanceof Node ? child : textNode(String(child))]
}

// Text becomes a Text node and a prop a DOM property, so nothing here is ever
// parsed as HTML. A title of "<img src=x>" stays text. h also records what it
// made, which is how patch recognises its own work on a later render.
export const h = (
  tag: string | ((props: any) => Node) | (new () => HTMLElement),
  props: Record<string, unknown> | null,
  ...children: Array<Child>
): Node => {
  // A class first, because a class is a function too and a component is not a
  // prototype-bearing constructor of an element.
  if (typeof tag === "function" && tag.prototype instanceof HTMLElement) {
    const view = tag as unknown as new () => HTMLElement
    // What the view passed belongs to the element (a component reads it in its own
    // connected), so building another of the same kind passes the same things again.
    const made = (built: Array<Child>) => {
      const element = new view() as HTMLElement & Record<string, unknown>
      for (const [key, value] of Object.entries(props ?? {})) if (key !== "children") element[key] = value
      element.append(...nodes(built))
      return element
    }
    const element = made(children)
    madeFrom.set(element, { tag, props: props ?? null, children, build: made })
    return element
  }
  if (typeof tag === "function") {
    // A component's props are its own. Handing a component a `children` it never
    // asked for, and then recording that it made the element it returned, would tell
    // patch the returned element carries those props — and patch would hand them to a
    // kept node later, which is how a link built by a component ends up with a click
    // that does not belong to it.
    const args = { ...props } as Record<string, unknown>
    if (children.length > 0) args.children = children
    return (tag as (props: any) => Node)(args)
  }
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

// A fragment would *hold* the nodes, and holding moves them: the moment a view built
// one, the nodes the render was about to hand over would be parented to it, and patch
// would find the element for a slot already belonging to something else. So a fragment
// stays what a fragment is used for here — the list of nodes a parent should hold.
export const Fragment = ({ children }: { readonly children?: Child }): Array<Node> => nodes(children)

// The registry belongs to the root element, so a test passes its own and two
// instances on one page do not share state.
export class BilletApp extends HTMLElement {
  #registry: AtomRegistry | undefined

  get registry(): AtomRegistry {
    if (this.#registry === undefined) this.#registry = AtomRegistryNS.make({ defaultIdleTTL: 400 })
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
  // Whether the element has drawn itself. h appends the children it was given when
  // it builds an element, so one that also built its own markup in connected would
  // hold it twice: connected runs once, the first time the element is in a page, and
  // a re-attach only redraws an element that draws itself from what it watches.
  #drawn = false

  get registry(): AtomRegistry {
    const host = this.closest("billet-app")
    if (host === null) throw new Error(`${this.tagName.toLowerCase()} is outside <billet-app>`)
    return host.registry
  }

  watch<A>(atom: Atom.Atom<A>, f: (value: A) => void) {
    this.#stops.push(this.registry.subscribe(atom, f, { immediate: true }))
  }

  /**
   * Fire a mutation and settle when it does: the promise a form holds while a note
   * is saving, so it can keep the button off until a result arrives.
   *
   * The result is read through a subscription opened before the write, not through
   * AtomRegistry.getResult. getResult waits for the atom's value to *change*, so a
   * second save onto an atom that already holds a Failure of the same shape never
   * settles and the caller's .then never runs. A subscription sees every write.
   */
  run<A, E, W>(atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>, value: W): Promise<A> {
    const registry = this.registry
    return Effect.runPromise(
      // toExit can also fail with NoSuchElementError, which a mutation that was
      // just written never reaches; the channel is widened rather than asserted.
      Effect.callback<A, E | Cause.NoSuchElementError>((resume) => {
        let settled = false
        const finish = (result: AsyncResult.AsyncResult<A, E>) => {
          if (settled) return
          settled = true
          stop()
          resume(AsyncResult.toExit(result))
        }
        const stop = registry.subscribe(atom, (result) => {
          if (AsyncResult.isNotInitial(result) && !result.waiting) finish(result)
        })
        registry.set(atom, value)
      })
    )
  }

  abstract connected(): void

  // A detach is not the end of an element: patch moves a node it is keeping, and a
  // page change takes a page out and puts the next one in, both of which run this
  // again for an element the page still holds. A piece of the page that draws itself
  // has to draw again, and one that built its own markup has to not build it twice,
  // which is what an element that appends guards with.
  connectedCallback() {
    if (this.#drawn) {
      this.reattached()
      return
    }
    this.#drawn = true
    this.connected()
  }

  /**
   * The element was taken out of a page and put back — which patch does to a node it
   * only moved, and a page change does to the page that comes back. An element that
   * draws itself from what it watches has to draw again, because the page it was
   * placed in may not be the one it drew; one that built its own markup once (a form)
   * still holds it, so it does nothing.
   */
  reattached(): void {}

  // What ends the subscriptions is the element going away for good. Ending them on a
  // detach instead leaves a view that was only moved unable to draw again, which
  // reads as the page standing still while its data changes. A view is only retired
  // from the page that holds it, which is what patch does to a node the render left.
  override remove() {
    this.#stops.splice(0).forEach((stop) => stop())
    super.remove()
  }
}

const sameAs = (old: Node, node: Node): boolean => {
  if (old === node) return true
  if (node.nodeType === Node.TEXT_NODE) return old.nodeType === Node.TEXT_NODE && old.nodeValue === node.nodeValue
  const made = madeFrom.get(node)
  if (made === undefined || old.nodeType !== Node.ELEMENT_NODE) return false
  // Only a node that is what this render says it is can be kept: the same tag, the
  // same props, the same children. Both sides have to be h's own, because a node with
  // no record of what it was made from proves nothing — isEqualNode sees attributes
  // and text but not the handler behind an onclick, so it would keep a link that
  // navigates to the wrong page and call that a match.
  const previous = madeFrom.get(old)
  if (previous === undefined) return false
  return sameMadeFrom(previous, made)
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

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  }
  // Two different functions are never the same prop. A handler closes over data,
  // so a row whose handler changed is a different row and must not be reused with
  // the old closure still attached.
  return false
}

const sameChildren = (a: Array<Child>, b: Array<Child>): boolean => {
  const [left, right] = [nodes(a).map(childKey), nodes(b).map(childKey)]
  return left.length === right.length && left.every((x, i) => x === right[i])
}

// A child is a node, an array, or nothing; the key of a list of them is the keys of
// the nodes it flattens to, joined.
const childKey = (child: Child): string => nodes(child).map(nodeKeyOf).join("")

const childrenKey = (children: Array<Child>): string => children.map(childKey).join("")

const nodeKeyOf = (node: Node): string => {
  const made = madeFrom.get(node)
  if (made === undefined) return `${node.nodeType}:${node.nodeName}:${node.textContent ?? ""}`
  return madeKey(made)
}

const madeKey = (made: MadeFrom): string => {
  const props = Object.entries(made.props ?? {})
    .filter(([key]) => key !== "children")
    .map(([key, value]) => `${key}=${propValueKey(value)}`)
    .sort()
    .join(",")
  const tag = typeof made.tag === "function" ? made.tag.name : String(made.tag)
  return `<${tag} ${props}>${childrenKey(made.children)}</${tag}>`
}

// A value as data, or as the identity it has. An array of children is children, so it
// keeps comparing structurally; a handler or an object is compared by identity, so a
// node whose prop came from a different render is a different node.
const propValueKey = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((x) => (x === null || typeof x !== "object" ? String(x) : nodeKeyOf(x as Node))).join(",")}]`
  return propKey(value)
}

// A key for a prop that says whether a kept node could keep working. A function is
// never the same function twice and an object carries no identity of its own, so both
// make the node different: a Link whose href changed is a different link, and keeping
// the old node would keep the click that sends a person to where the last page sent
// them. Text is compared as text, because a label is the same label.
const propKey = (value: unknown): string => {
  if (typeof value === "function") return `fn:${fnId(value)}`
  if (typeof value === "object" && value !== null) return `obj:${objId(value)}`
  return `val:${typeof value}:${String(value)}`
}

const fnIds = new WeakMap<Function, number>()
let nextId = 0
const fnId = (fn: Function) => {
  const found = fnIds.get(fn)
  if (found !== undefined) return found
  const made = nextId++
  fnIds.set(fn, made)
  return made
}

const objIds = new WeakMap<object, number>()
const objId = (obj: object) => {
  const found = objIds.get(obj)
  if (found !== undefined) return found
  const made = nextId++
  objIds.set(obj, made)
  return made
}

// Reconcile the children of `parent` against `next`, keeping every node that did
// not change so focus, selection, caret position and an in-flight animation stay
// where they were. Custom elements are never reused: they hold their own state,
// and rebuilding one is what a view change asks for.
export const patch = (parent: Node, next: Child) => {
  const wanted = nodes(next)

  const spare = [...parent.childNodes]
  const kept: Array<Node> = []
  // Nodes this pass has already placed, so one node cannot serve two slots and a
  // node already in the tree is copied rather than moved.
  const claimed = new Set<Node>()

  for (const node of wanted) {
    // A view that hands the same node to two slots would silently lose one of
    // them, because a node is only ever in the tree once. Copy it instead, so two
    // wanted children always leave two children.
    if (claimed.has(node)) {
      const copy = node.cloneNode(true)
      claimed.add(copy)
      kept.push(copy)
      continue
    }
    const isElement = node.nodeType === Node.ELEMENT_NODE

    // A node is kept when it is the node the last render made (identity) or the
    // same node made from the same data. Position is not part of it: a row that
    // moved in the list is still that row, and a field a person is typing in is
    // still their field.
    // A custom element carries state no other node can take over — a form's field, a
    // view's subscription — and no other node may be given its identity either: a
    // later render that matched one by shape would stamp what it wanted onto whichever
    // element the page happened to hold there, then throw its own element away and
    // keep the wrong one. So it matches by identity and nothing else. A plain node
    // carries nothing, so its shape is enough, and keeping the shell the page holds is
    // what keeps a focus and a caret.
    const isCustom = isElement && node.nodeName.includes("-")
    const shown = isElement && node.parentNode === parent
    let match = spare.findIndex((old) => !claimed.has(old) && (isCustom ? old === node : sameAs(old, node)))
    if (match === -1 && isElement && !isCustom && !shown) {
      // Same tag, different content: keep the shell and fix what is inside it, so
      // a focus inside it survives an update of its text. A view keeps no node
      // between renders, so this is how an unchanged page keeps its caret.
      match = spare.findIndex((old) => !claimed.has(old) && old.nodeName === node.nodeName && !old.nodeName.includes("-"))
    }

    if (match === -1) {
      // A node not in a page yet is placed as it is. One the page holds has to become
      // a second node of the same kind, because a node is only ever in the tree once:
      // a custom element is built again by h (a clone would not carry the atom, and
      // its connected could not open the watch it draws itself from), and a plain node
      // is copied, because a plain node carries nothing but what it looks like.
      let made: Node
      if (node.parentNode === null) made = node
      else if (isCustom) {
        const built = madeFrom.get(node)
        // Only h builds these, so an element with no record of what it was made from
        // cannot be built again: what it watches is lost, and a view that watches
        // nothing shows an empty page forever. That is a bug in this file, not a thing
        // a page can do, so it says so instead of failing quietly.
        if (built?.build === undefined) {
          throw new Error(`${node.nodeName.toLowerCase()} is in the page but was not built by h, so it cannot be placed twice`)
        }
        made = built.build(built.children)
      } else made = node.cloneNode(true)
      claimed.add(made)
      kept.push(made)
      continue
    }

    const old = spare.splice(match, 1)[0] as Node
    claimed.add(old)
    if (isElement) {
      // The props belong to the element, and patch only ever recurses into children,
      // so they have to be applied here, and before it does. This is how a view that
      // the page keeps gets the thing it watches: an element kept for its shape and
      // never given the atom or the render the slot now asks for would go on drawing
      // the page that was here before, which reads as the data changing and the page
      // not. A route hands its element the function that draws the path this way too —
      // without it a back button looks dead while the address bar moves.
      updateAttributes(old as Element, node as Element)
      copyProperties(old as HTMLElement, node as HTMLElement)
      // A form or an input keeps its own value, and a kept node must not show a value
      // from an earlier render. h sets these as properties, so patch copies them too,
      // but never over a value the person typed.
      copyFormProperties(old as HTMLElement, node as HTMLElement)
      // Always: a node kept for its shape alone carries the children of the page that
      // was here before, and this is the only place that brings them round to what the
      // render wants. Skipping it for a node that was not made the same way leaves the
      // page showing the page that came before — a back button that does nothing while
      // the address bar moves.
      patch(old, [...node.childNodes])
    }
    kept.push(old)
  }

  // Anything still in the parent that this pass did not place came from an earlier
  // render and is retired. Without this the page keeps a node the render did not ask
  // for beside the ones it did, and the first of them wins every query a test or a
  // person makes, so the page looks as if nothing had changed.
  for (const old of [...parent.childNodes]) if (!kept.includes(old)) parent.removeChild(old)

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
  // A handler is *the* handler, not one of them. A kept node has to end up holding
  // exactly what this render says, including nothing: a node the page kept across two
  // pages would otherwise keep the click of the page that came before, so the link
  // the person is pressing would take them to where the earlier page sent them.
  const names = new Set<string>([...EVENT_PROPS, ...Object.keys(node)])
  for (const name of names) {
    if (!isHandlerProp(name)) continue
    const next = (node as any)[name]
    if (next !== undefined) (old as any)[name] = next
    else if ((old as any)[name] !== null && (old as any)[name] !== undefined) (old as any)[name] = null
  }
}

// hidden and disabled are properties, and isEqualNode cannot see a property, so a
// kept node would stay stuck disabled after a save, or stuck hidden after a save
// that failed. A field is different: its value belongs to the person, not the
// render. h can only set value as an attribute, which sets the field's *default*,
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

  // A view draws itself from the atom it watches. h sets both when it builds the
  // element, so one patch hands over already has what it needs; one without an atom
  // could only be an element patch built itself, which cannot happen.
  //
  // The first connect opens the watch, whose immediate call draws. A re-attach (which
  // patch causes for a node it only moved, and a page change for the page that comes
  // back) redraws from the last value, because the element was only taken out and put
  // back — the page that sits in it now is the one patch placed there, and an element
  // that stayed quiet would keep drawing over it from a stale watch or not at all.
  #last: A | undefined
  #opened = false

  connected(): void {
    this.#opened = true
    this.watch(this.atom, (value) => {
      this.#last = value
      patch(this, this.render(value))
    })
  }

  override reattached(): void {
    if (this.atom === undefined || !this.#opened) return
    if (this.#last !== undefined) patch(this, this.render(this.#last))
  }
}
customElements.define("atom-view", AtomView)

// A view is built again for every render, so patch is never handed an element the page
// already holds: a node the browser is showing belongs to that page, and a render that
// handed it back could not be told from the page a person is looking at.
export const view = <A>(atom: Atom.Atom<A>, render: (value: A) => Child): () => Node =>
  () => h(AtomView, { atom, render })


