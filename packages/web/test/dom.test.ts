// @vitest-environment jsdom
//
// patch is a reconciler we own, and a reconciler that replaces a view's children
// wholesale passes every content test while it moves focus to <body>. These are
// the tests the React suite never needed, because React did this for us.
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest"
import { Fragment, h, nodes, patch } from "../src/dom.ts"

const render = (parent: Node, children: Parameters<typeof patch>[1]) => patch(parent, nodes(children))


let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.append(root)
})

afterEach(() => {
  root.remove()
})

describe("h", () => {
  it("makes a real element and sets props as properties", () => {
    const input = h("input", { id: "title", name: "title" }) as HTMLInputElement
    assert.instanceOf(input, HTMLInputElement)
    assert.strictEqual(input.id, "title")
  })

  it("keeps HTML in a title as text and never as markup", () => {
    const p = h("p", null, "<img src=x onerror=boom()>") as HTMLElement
    assert.strictEqual(p.textContent, "<img src=x onerror=boom()>")
    assert.strictEqual(p.querySelector("img"), null)
  })

  it("drops null, undefined, false and true, and stringifies numbers", () => {
    const div = h("div", null, "a", null, undefined, false, true, 7) as HTMLElement
    assert.strictEqual(div.textContent, "a7")
  })

  it("flattens nested arrays of children", () => {
    const div = h("div", null, [["a", ["b"]], "c"]) as HTMLElement
    assert.strictEqual(div.textContent, "abc")
  })

  it("calls a function tag with its props and children", () => {
    const Tag = ({ children }: { readonly children?: unknown }) => h("em", null, children)
    assert.strictEqual((h(Tag, null, "y") as HTMLElement).outerHTML, "<em>y</em>")
  })

  it("Fragment holds children without an element of its own", () => {
    const frag = h(Fragment, null, "a", h("b", null, "b"))
    assert.instanceOf(frag, DocumentFragment)
    assert.strictEqual(frag.childNodes.length, 2)
  })
})

describe("patch keeps the content right", () => {
  it("keeps the same element when its content is identical", () => {
    render(root, h("ul", null, h("li", null, "a"), h("li", null, "b")))
    const before = [...root.querySelectorAll("li")]
    render(root, h("ul", null, h("li", null, "a"), h("li", null, "b")))
    assert.deepEqual([...root.querySelectorAll("li")], before, "unchanged rows must be the same nodes")
  })

  it("keeps a text node that did not change", () => {
    render(root, h("p", null, "steady"))
    const text = root.firstChild!.firstChild!
    render(root, h("p", null, "steady"))
    assert.strictEqual(root.firstChild!.firstChild, text)
  })

  it("adds, removes and updates", () => {
    const list = (titles: Array<string>) => h("ul", null, ...titles.map((t) => h("li", null, t)))
    render(root, list(["a", "b", "c"]))
    assert.strictEqual(root.querySelectorAll("li").length, 3)
    render(root, list(["a", "c", "d"]))
    assert.deepEqual([...root.querySelectorAll("li")].map((li) => li.textContent), ["a", "c", "d"])
  })

  it("keeps the order when rows move", () => {
    render(root, h("ul", null, h("li", null, "a"), h("li", null, "b"), h("li", null, "c")))
    const [a, b, c] = [...root.querySelectorAll("li")]
    render(root, h("ul", null, h("li", null, "c"), h("li", null, "a"), h("li", null, "b")))
    assert.deepEqual([...root.querySelectorAll("li")], [c, a, b])
  })

  it("updates a node when its attributes changed", () => {
    render(root, h("a", { href: "/notes/1" }, "one"))
    render(root, h("a", { href: "/notes/2" }, "one"))
    assert.strictEqual((root.firstChild as HTMLAnchorElement).getAttribute("href"), "/notes/2")
  })

  it("removes an attribute that went away", () => {
    render(root, h("p", { role: "alert" }, "oops"))
    render(root, h("p", null, "oops"))
    assert.strictEqual((root.firstChild as HTMLElement).hasAttribute("role"), false, "a stale role=alert is still announced as an alert")
  })

  it("removes a class that went away", () => {
    render(root, h("p", { className: "here" }, "x"))
    render(root, h("p", null, "x"))
    assert.strictEqual((root.firstChild as HTMLElement).hasAttribute("class"), false)
  })

  it("updates a boolean property such as hidden", () => {
    const renderHidden = (hidden: boolean) => render(root, h("p", { role: "alert", hidden }, "oops"))
    renderHidden(false)
    renderHidden(true)
    assert.strictEqual((root.firstChild as HTMLElement).hidden, true)
    renderHidden(false)
    assert.strictEqual((root.firstChild as HTMLElement).hidden, false)
  })

  it("treats two rows with the same content as the same row", () => {
    render(root, h("ul", null, h("li", null, "same"), h("li", null, "same")))
    const before = [...root.querySelectorAll("li")]
    render(root, h("ul", null, h("li", null, "same"), h("li", null, "same")))
    assert.deepEqual([...root.querySelectorAll("li")], before)
  })

  it("empties a parent and fills one that was empty", () => {
    render(root, h("p", null, "here"))
    render(root, [])
    assert.strictEqual(root.childNodes.length, 0)
    render(root, [h("span", null, "back"), " and text"])
    assert.strictEqual(root.childNodes.length, 2)
    assert.strictEqual(root.textContent, "back and text")
  })

  it("patches text to an element and back", () => {
    render(root, "plain")
    render(root, h("strong", null, "bold"))
    assert.strictEqual(root.querySelector("strong")?.textContent, "bold")
    render(root, "plain")
    assert.strictEqual(root.textContent, "plain")
    assert.strictEqual(root.children.length, 0)
  })

  it("is stable when the same nodes are patched twice", () => {
    render(root, h("p", null, "one"))
    const children = nodes(h("p", null, "two"))
    patch(root, children)
    patch(root, children)
    assert.strictEqual(root.textContent, "two")
    assert.strictEqual(root.childNodes.length, 1)
  })
})

describe("patch keeps focus, which is why it exists", () => {
  const listWith = (count: number, extra: Node) =>
    h(Fragment, null, extra, h("ul", null, ...Array.from({ length: count }, (_, i) => h("li", null, `row ${i}`))))

  it("keeps focus in an input while the list is drawn again", () => {
    render(root, listWith(1, h("input", { id: "title" })))
    const input = root.querySelector("input")!
    input.focus()
    assert.strictEqual(document.activeElement, input, "the test must start with the input focused")

    render(root, listWith(3, h("input", { id: "title" })))

    assert.strictEqual(root.querySelectorAll("li").length, 3)
    assert.strictEqual(document.activeElement, input, "focus moved: a keyboard user loses their place")
  })

  it("keeps the caret and typed text of an input across a refresh", () => {
    render(root, listWith(1, h("input", { id: "title" })))
    const input = root.querySelector("input")!
    input.value = "ship it"
    input.focus()
    input.setSelectionRange(3, 3)

    render(root, listWith(2, h("input", { id: "title" })))

    const kept = root.querySelector("input")!
    assert.strictEqual(kept, input, "the input was rebuilt, so its value and caret are gone")
    assert.strictEqual(kept.value, "ship it")
    assert.strictEqual(kept.selectionStart, 3)
  })

  it("keeps focus on a link in the list while the list is drawn again", () => {
    const view = (words: number) =>
      h("ul", null, h("li", null, h("a", { href: "/notes/1" }, "one"), " ", h("small", null, `${words} words`)))
    render(root, view(1))
    const link = root.querySelector("a")!
    link.focus()

    render(root, view(2))

    assert.strictEqual(root.querySelector("small")?.textContent, "2 words")
    assert.strictEqual(document.activeElement, link, "the link was rebuilt, so focus went to <body>")
  })

  it("keeps a selection in a textarea across a refresh", () => {
    render(root, listWith(1, h("textarea", null)))
    const box = root.querySelector("textarea")!
    box.value = "hello world"
    box.focus()
    box.setSelectionRange(2, 5)

    render(root, listWith(2, h("textarea", null)))

    assert.strictEqual(root.querySelector("textarea"), box)
    assert.strictEqual((root.querySelector("textarea") as HTMLTextAreaElement).selectionStart, 2)
  })

  it("runs the new handler when a row's own data changed", () => {
    // The stale-closure trap. A kept node keeps what it was made with, so a row
    // whose data changed must get the new node's handler, or the row acts on the
    // data it was first made with.
    const seen: Array<string> = []
    const row = (label: string) =>
      h(
        "li",
        null,
        h("a", {
          href: "/notes/1",
          onclick: () => {
            seen.push(label)
          }
        }, label)
      )

    render(root, h("ul", null, row("one"), row("two")))
    render(root, h("ul", null, row("ONE"), row("two")))

    const relabelled = root.querySelector("a")!
    assert.strictEqual(relabelled.textContent, "ONE")
    relabelled.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    assert.deepEqual(seen, ["ONE"])
  })

  it("attaches a handler passed to h, which is how every view here binds one", () => {
    let fired = 0
    const button = h("button", { onclick: () => { fired += 1 } }, "Add") as HTMLButtonElement
    root.append(button)
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    assert.strictEqual(fired, 1)
  })

  it("does not try to assign a property the browser will not let us assign", () => {
    // addEventListener is not writable and `in` is true for it, so a naive
    // `name in element` branch throws here instead of falling back to an attribute.
    const div = h("div", { addEventListener: "x" }) as HTMLElement
    assert.strictEqual(div.getAttribute("addEventListener"), "x")
  })

  it("keeps one handler, not two, when a row did not change", () => {
    let count = 0
    const row = () =>
      h(
        "li",
        null,
        h("a", {
          href: "/notes/1",
          onclick: () => {
            count += 1
          }
        }, "one")
      )
    render(root, h("ul", null, row()))
    render(root, h("ul", null, row()))
    root.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    assert.strictEqual(count, 1, "the handler was bound twice, so one click counted twice")
  })
})

describe("patch cost stays usable for a list", () => {
  it("refreshes 200 unchanged rows quickly", () => {
    const list = (n: number) => h("ul", null, ...Array.from({ length: n }, (_, i) => h("li", null, `row ${i}`)))
    render(root, list(200))

    const started = performance.now()
    render(root, list(200))
    const elapsed = performance.now() - started

    assert.strictEqual(root.querySelectorAll("li").length, 200)
    expect(elapsed).toBeLessThan(250)
  })
})
