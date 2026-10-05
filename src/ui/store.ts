export type Listener<S> = (state: S, previous: S) => void;

/** Minimal state container: one immutable state object, replaced on update. */
export class Store<S extends object> {
  private state: S;
  private readonly listeners = new Set<Listener<S>>();

  constructor(initial: S) {
    this.state = initial;
  }

  get(): S {
    return this.state;
  }

  update(change: Partial<S> | ((state: S) => Partial<S>)): void {
    const previous = this.state;
    const patch = typeof change === 'function' ? change(previous) : change;
    this.state = { ...previous, ...patch };
    for (const listener of this.listeners) listener(this.state, previous);
  }

  subscribe(listener: Listener<S>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** True on the first render (no previous state), or when any of `keys` holds a new value. */
export function hasChanged<S extends object>(state: S, previous: S | undefined, ...keys: (keyof S)[]): boolean {
  return !previous || keys.some((key) => state[key] !== previous[key]);
}
