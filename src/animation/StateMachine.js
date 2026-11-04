export class StateMachine {
  constructor(context, states) {
    this.ctx = context;
    this.states = states;
    this.name = null;
    this.state = null;
    this.params = {};
    this.data = {};
    this.time = 0;
    this.listeners = new Set();
    /** Optional (name) => name hook letting the context substitute states it can't perform. */
    this.remap = null;
  }

  go(next, params) {
    let name = next;
    if (typeof next === 'object') {
      name = next.name;
      params = next.params;
    }
    if (this.remap) name = this.remap(name);
    const state = this.states[name];
    if (!state) throw new Error(`Unknown state "${name}"`);

    const prev = this.name;
    this.state?.exit?.(this.ctx, this.data, this.params);
    this.name = name;
    this.state = state;
    this.params = params ?? {};
    this.data = {};
    this.time = 0;
    state.enter?.(this.ctx, this.params, this.data);
    for (const fn of this.listeners) fn(name, prev);
  }

  update(dt) {
    if (!this.state) return;
    this.time += dt;
    const next = this.state.update?.(this.ctx, dt, this.time, this.data, this.params);
    if (next) this.go(next);
  }
}
