/**
 * Tiny element builder. All text goes in as text nodes and attributes are set
 * one by one, so file names or contact details can never be interpreted as
 * HTML. (innerHTML is banned by the lint config.)
 */
type Child = Node | string | number | null | undefined | false;
type Listener = (event: never) => void;
type PropValue = string | number | boolean | null | undefined | Listener;

export interface Props {
  readonly [name: string]: PropValue;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      element.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    } else if (name === 'class') {
      element.className = String(value);
    } else {
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
  append(element, ...children);
  return element;
}

function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Replaces all children of `parent`. */
export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

/** Re-renders a region while keeping keyboard focus on the "same" control. */
export function preservingFocus(region: Element, render: () => void): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && region.contains(active) ? active.dataset.focusKey : undefined;
  render();
  if (key) region.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}
