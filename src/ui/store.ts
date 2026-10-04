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
