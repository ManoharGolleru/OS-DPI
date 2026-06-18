# Mock auto-scan authoring

This directory contains the first, deterministic authoring milestone. It does
not integrate an LLM provider, API key, server, or chat interface.

The mock prompt adapter recognizes:

> Create an auto-scan interface where Enter selects the current button.

It produces one validated `configure_auto_scan` plan. The browser-side command
uses OS-DPI's registered TreeBase classes to add four static buttons, a display,
an activation action, a safe overlay cue, a scan pattern, and the timer loop
demonstrated by `autoscan.osdpi`:

- Space starts or resumes the timer.
- The timer advances the pattern and restarts itself.
- Enter activates the current target and restarts the timer.

The command replaces only its own namespaced nodes when run again. Existing
mouse and pointer methods remain untouched.

## Development hook

On a local development server, add `?authoring=mock` to the URL. A small
**Create mock auto-scan** button appears for manual testing, and the console
also exposes:

```js
await window.osdpiAuthoring.runMockPrompt(
  "Create an auto-scan interface where Enter selects the current button.",
);
```

## Tests

From `src/`:

```sh
npm test
npm run check
npm run build
npm run test:e2e
```

The next LLM milestone should translate natural language into the same narrow
edit-plan schema. It should not generate raw OS-DPI JSON.
