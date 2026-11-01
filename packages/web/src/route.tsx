import { type ComponentProps, type MouseEvent, useSyncExternalStore } from "react"

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname)

const navigate = (path: string) => {
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

export function Link({ href, ...props }: ComponentProps<"a"> & { readonly href: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={onClick} {...props} />
}
