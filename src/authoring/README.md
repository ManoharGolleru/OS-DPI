# Auto-scan authoring

This directory contains two deliberately narrow authoring milestones. Both
produce the same validated `configure_auto_scan` edit plan. Neither mode lets a
planner generate raw OS-DPI JSON or mutate OS-DPI state directly.

The browser always validates a returned plan before the existing
`configureAutoScan` command applies it through OS-DPI's registered `TreeBase`
classes.

## Milestone 1: deterministic mock mode

The mock prompt adapter recognizes:

> Create an auto-scan interface where Enter selects the current button.

It returns:

```json
{
  "operation": "configure_auto_scan",
  "startKey": "Space",
  "selectKey": "Enter",
  "intervalSeconds": 0.6,
  "restartAfterSelection": true,
  "buttonLabels": ["Yes", "No", "Help", "Stop"]
}
```

Run the Vite development server and open:

```text
http://127.0.0.1:8080/OS-DPI/?authoring=mock
```

The **Create mock auto-scan** button applies the deterministic plan.

## Milestone 2: optional LLM planner mode

The LLM is a planner only:

1. The browser sends a prompt and three optional design counts to the local
   Vite development server.
2. The selected provider returns only the approved edit-plan schema.
3. The server validates the plan.
4. The browser validates it again.
5. The existing OS-DPI authoring command applies the plan locally only after
   validation succeeds.

The API key stays in the Vite server process. It is never included in browser
code. The local endpoint does not write IndexedDB, construct OS-DPI JSON, or
apply any design changes.

The endpoint is installed as development middleware in the existing Vite
server, so there is no second server process to run.

Set environment variables from `src/`:

```sh
AUTHORING_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.5
npm run start
```

`OPENAI_MODEL` is optional and defaults to `gpt-5.5`. You may put these values
in `src/.env.local`, which is ignored by Git.

Then open:

```text
http://127.0.0.1:8080/OS-DPI/?authoring=llm
```

Use **Generate with LLM** to request and inspect a plan. **Apply plan** remains
disabled until validation passes.

If `AUTHORING_PROVIDER` is unset, the server uses the deterministic mock
provider. If it is `openai` but `OPENAI_API_KEY` is missing, the server
explicitly falls back to mock and returns a warning that is shown in the
status area.

## Tests

From `src/`:

```sh
npm test
npm run check
npm run build
npm run test:e2e
```

Automated tests stub planner responses and never make paid API calls.

## Current limitations

- Only `configure_auto_scan` is supported.
- Arbitrary OS-DPI JSON generation is rejected.
- Full interface design is not supported.
- No model is fine-tuned.
- Cloud API mode is for local development only until a production server and
  authentication design exist.
- The UI is intentionally a minimal development hook, not a chat interface.
