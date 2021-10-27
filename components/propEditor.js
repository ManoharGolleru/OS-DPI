import { html } from "uhtml";
import { validateColor, getColor } from "./style";
import Tribute from "tributejs";
import { textInput } from "./input";

/**
 * @param {string} name
 * @param {any} value
 * @param {PropertyInfo} info
 * @param {Context} context
 * @param {(name: string, value: any) => void} [hook]
 */
export function propEditor(name, value, info, context, hook) {
  function propUpdate({ target }) {
    const name = target.name;
    const value = target.value;
    console.log({ name, value });
    hook(name, value);
  }
  const label = html`<label for=${name}>${info.name}</label>`;
  switch (info.type) {
    case "string":
      return html`<label for=${name}>${info.name}</label>
        <input
          type="text"
          id=${name}
          name=${name}
          .value=${value}
          onchange=${propUpdate}
          autocomplete="off"
        />`;
    case "number":
      return html`${label}
        <input
          type="number"
          id=${name}
          name=${name}
          .value=${value}
          onchange=${propUpdate}
          autocomplete="off"
        />`;
    case "color":
      return html`<label for=${name}>${info.name}</label>
        <div class="color-input">
          <input
            id=${name}
            type="text"
            name=${name}
            .value=${value}
            list="ColorNames"
            onchange=${(/** @type {InputEventWithTarget} */ event) =>
              validateColor(event) && propUpdate(event)}
            autocomplete="off"
          />
          <div
            class="swatch"
            style=${`background-color: ${getColor(value)}`}
          ></div>
        </div>`;
    case "select":
      return html`<label for=${name}>${info.name}</label>
        <select id=${name} name=${name} onchange=${propUpdate}>
          ${info.values?.map(
            (ov) =>
              html`<option value=${ov} ?selected=${ov == value}>${ov}</option>`
          )}
        </select>`;
    case "state":
      const { tree, rules } = context;
      let states = new Set([...tree.allStates(), ...rules.allStates()]);
      return textInput({
        type: "text",
        name,
        label: info.name,
        value,
        context,
        validate: (value) => (value.match(/^\$\w+$/) ? "" : "Invalid state"),
        update: hook,
        suggestions: states,
      });
    case "string[]": {
      const strings = value.length ? [...value] : [""];
      return html`${strings.map((string, index) => {
          const id = `${name}_${index}`;
          const hidden = index != 0;
          const label = index != 0 ? `${info.name} ${index + 1}` : info.name;
          return html`
            <label for=${id} ?hidden=${hidden}>${label}</label>
            <input
              type="text"
              id=${id}
              .value=${string}
              onchange=${(/** @type {InputEventWithTarget} */ event) => {
                if (!event.target.value) {
                  strings.splice(index, 1);
                } else {
                  strings[index] = event.target.value;
                }
                (!info.validate || info.validate(event)) && hook(name, strings);
              }}
            />
          `;
        })}<button
          onclick=${() => {
            strings.push("New");
            hook(name, strings);
          }}
        >
          ${info.addMessage}
        </button>`;
    }

    case "conditions": {
      const strings = [...value, ""];
      return html`<fieldset>
        <legend>Conditions</legend>
        ${strings.map((string, index) => {
          const id = `${name}_${index}`;
          const label = `${info.name} ${index + 1}`;
          return html`
            <label for=${id} hidden>${label}</label>
            <input
              type="text"
              id=${id}
              .value=${string}
              onchange=${(/** @type {InputEventWithTarget} */ event) => {
                if (!event.target.value) {
                  strings.splice(index, 1);
                } else {
                  strings[index] = event.target.value;
                }
                (!info.validate || info.validate(event)) && hook(name, strings);
              }}
            />
          `;
        })}
      </fieldset>`;
    }
    case "stateUpdate":
      const object = value ? { ...value } : {};
      const entries = Object.entries(object);
      let stateNode = null;
      let valueNode = null;
      // value updates
      return html` <fieldset>
        <legend>Update</legend>
        <span class="key">State</span>
        <span class="value">New value</span>
        ${entries.map(([key, value], index) => {
          const idk = `${name}_${key}`;
          const idv = `${name}_${key}_value`;
          return html`<label class="key" for=${idv}>${key}</label>
            <input
              class="value"
              type="text"
              id=${idv}
              .value=${value}
              onchange=${(/** @type {InputEventWithTarget} */ event) => {
                const newValue = event.target.value.trim();
                if (!newValue) {
                  delete object[key];
                } else {
                  object[key] = newValue;
                }
                (!info.validate || info.validate(event)) && hook(name, object);
              }}
              ref=${(node) => {
                suggest(node, [...info.states, ...info.fields]);
              }}
            /> `;
        })}
        <label for="newState" hidden>new State</label>
        <input
          class="key"
          type="text"
          id="newState"
          .value=${""}
          onchange=${(/** @type {InputEventWithTarget} */ event) => {
            const newKey = event.target.value.trim();
            const newValue = valueNode && valueNode.value.trim();
            if (newKey && newValue) {
              object[newKey] = newValue;
              (!info.validate || info.validate(event)) && hook(name, object);
            }
          }}
          oninput=${(/** @type {InputEventWithTarget} */ ev) => {
            const target = ev.target;
            if (!target.value.startsWith("$")) {
              target.setCustomValidity("states must begin with $");
            }
          }}
          ref=${(node) => {
            stateNode = node;
            suggest(node, info.states);
          }}
        />
        <label for="newValue" hidden>new value</label>
        <input
          class="value"
          type="text"
          id="newValue"
          .value=${""}
          onchange=${(/** @type {InputEventWithTarget} */ event) => {
            const newValue = event.target.value.trim();
            const newKey = stateNode && stateNode.value;
            console.log({ newKey, newValue, snv: stateNode.value });
            if (!newValue && newKey) {
              delete object[newKey];
              (!info.validate || info.validate(event)) && hook(name, object);
            } else if (newValue && newKey) {
              object[newKey] = newValue;
              (!info.validate || info.validate(event)) && hook(name, object);
            }
          }}
          ref=${(node) => {
            valueNode = node;
            suggest(node, [...info.states, ...info.fields]);
          }}
        />
      </fieldset>`;
    default:
      console.log("tbd", name);
      return html`<p>${name}</p>`;
  }
}

/** @param {HTMLInputElement} node
 * @param {string[]} suggestions */
export function suggest(node, suggestions) {
  if (!suggestions.length) return;
  suggestions = [...new Set(suggestions)];
  const groups = suggestions.reduce((groupMap, suggestion) => {
    const key = suggestion[0];
    return groupMap.set(key, [...(groupMap.get(key) || []), suggestion]);
  }, new Map());
  let lastPattern = "";
  const collections = Array.from(groups).map(([key, values]) => ({
    trigger: key,
    selectTemplate: function (item) {
      const r = (item && item.trim()) || key + lastPattern;
      return r;
    },
    menuItemTemplate: (item) => item,
    noMatchTemplate: () => "",

    lookup: "key",

    values: values, //.map((value) => ({ key: value })),
  }));
  console.log("construct");
  const tribute = new Tribute({
    collection: collections,
    noMatchTemplate: () => "",
  });
  /* Hack the tribute search to make it NOT be fuzzy */
  /** @param {string} pattern
   * @param {Object} items
   */
  tribute.search.filter = (pattern, items) => {
    lastPattern = pattern;
    pattern = pattern.toLowerCase();
    const r = items.filter((s) => s.slice(1).toLowerCase().startsWith(pattern));
    console.log({ pattern, r });
    return r;
  };
  node.onfocus = () => {
    tribute.attach(node);
    console.log("attach", node);
  };
  node.onblur = () => {
    tribute.detach(node);
    console.log("detach", node);
  };
}