import merge from "mergerino";

export class State {
  constructor(persistKey = "") {
    this.persistKey = persistKey;
    /** @type {Set<function>} */
    this.listeners = new Set();
    /** @type {Object} */
    this.values = {};
    /** @type {Set<string>} */
    this.updated = new Set();
    if (this.persistKey) {
      /* persistence */
      const persist = window.sessionStorage.getItem(this.persistKey);
      if (persist) {
        this.values = JSON.parse(persist);
      }
    }
  }

  /** unified interface to state
   * @param {string} [name] - possibly dotted path to a value
   * @param {any} defaultValue
   * @returns {any}
   */
  get(name, defaultValue = "") {
    if (name && name.length) {
      return name
        .split(".")
        .reduce((o, p) => (o ? o[p.trim()] : defaultValue), this.values);
    } else {
      return undefined;
    }
  }

  /**
   * update the state with a patch and invoke any listeners
   *
   * @param {Object} patch - the changes to make to the state
   * @return {void}
   */
  update(patch = {}) {
    for (const key in patch) {
      this.updated.add(key);
    }
    this.values = merge(this.values, patch);
    for (const callback of this.listeners) {
      callback();
    }

    if (this.persistKey) {
      const persist = JSON.stringify(this.values);
      window.sessionStorage.setItem(this.persistKey, persist);
      // console.trace("persist $tabControl", this.values["$tabControl"]);
    }
  }

  /**
   * return a new state with the patch applied
   * @param {Object} patch - changes to apply
   * @return {State} - new independent state
   */
  clone(patch = {}) {
    const result = new State();
    result.values = merge(this.values, patch);
    return result;
  }

  /** clear - reset the state
   */
  clear() {
    const userState = Object.keys(this.values).filter((name) =>
      name.startsWith("$"),
    );
    const patch = Object.fromEntries(
      userState.map((name) => [name, undefined]),
    );
    this.update(patch);
  }

  /** observe - call this function when the state updates
   * @param {Function} callback
   */
  observe(callback) {
    this.listeners.add(callback);
  }

  /** return true if the given state has been upated on this cycle
   * @param {string} stateName
   * @returns boolean
   */
  hasBeenUpdated(stateName) {
    return this.updated.has(stateName);
  }

  /** clear updated for the next cycle
   */
  clearUpdated() {
    this.updated.clear();
  }

  /** define - add a named state to the global system state
   * @param {String} name - name of the state
   * @param {any} defaultValue - value if not already defined
   */
  define(name, defaultValue) {
    if (typeof this.values[name] === "undefined") {
      this.values[name] = defaultValue;
    }
  }
  /** interpolate
   * @param {string} input
   * @returns {string} input with $name replaced by values from the state
   */
  interpolate(input) {
    let result = input.replace(/(\$[a-zA-Z0-9_.]+)/g, (_, name) =>
      this.get(name),
    );
    result = result.replace(/\$\{([a-zA-Z0-9_.]+)}/g, (_, name) =>
      this.get("$" + name),
    );
    return result;
  }
}
