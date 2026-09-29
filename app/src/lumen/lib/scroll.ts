/** Scroll to the top without leaking the browser API's return value to React. */
export function scrollLumenViewToTop(): void {
  window.scrollTo({ top: 0 })
}