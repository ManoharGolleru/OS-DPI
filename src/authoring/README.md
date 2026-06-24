# OS-DPI authoring

This directory contains deliberately narrow authoring milestones. Each planner
returns only a validated edit plan. No mode lets a model generate raw OS-DPI
JSON, write IndexedDB directly, apply patches, invent action expressions, or
mutate OS-DPI state directly.

The browser always validates a returned plan before a deterministic authoring
command applies it through OS-DPI's registered `TreeBase` classes.

## Supported operations

### `configure_auto_scan`

Creates the deterministic Yes/No/Help/Stop auto-scan example:

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

The command owns the generated auto-scan display, buttons, action, cue, pattern,
timer, and key handlers. It is idempotent and does not remove unrelated
user-authored content.

### `create_sgd_interface`

Creates a small speech-generating device interface with a visible composition
display, QWERTY keyboard, core vocabulary, Delete, Clear, and Speak controls:

```json
{
  "operation": "create_sgd_interface",
  "title": "Generated SGD Interface",
  "displayState": "$Message",
  "keyboard": {
    "type": "qwerty",
    "includeSpace": true,
    "includeDelete": true,
    "includeClear": true
  },
  "coreVocabulary": [
    "I",
    "you",
    "want",
    "go",
    "more",
    "help",
    "yes",
    "no",
    "stop",
    "finished"
  ],
  "actions": {
    "lettersAppendToDisplay": true,
    "coreWordsAppendToDisplay": true,
    "deleteRemovesLastCharacter": true,
    "clearEmptiesDisplay": true,
    "speakUsesDisplay": true
  }
}
```

The plan describes intent only. The browser command supplies fixed, safe OS-DPI
action templates such as `add_letter(#label)`, `add_word(#label)`, Delete,
Clear, and `$Message`-to-Speech updates.

## Milestone 1: deterministic mock mode

The mock prompt adapter recognizes the original auto-scan prompt:

> Create an auto-scan interface where Enter selects the current button.

It also recognizes the first supported SGD request:

> I want a complex SGD interface with qwerty keyboard and also some Core
> vocabulary. The user should be able to see what they are composing via display
> and be able to delete or clear things.

Run the Vite development server and open:

```text
http://127.0.0.1:8080/OS-DPI/?authoring=mock
```

The **Create mock auto-scan** button applies the deterministic auto-scan plan.
The console helper can still be used for deterministic prompt checks.

## Milestone 2/3: conversational LLM planner mode

The LLM is a planner only:

1. A fixed local-development panel keeps a short in-memory conversation.
2. The browser sends the conversation and three optional design counts to the
   local Vite development server.
3. The selected provider returns a strict `clarification`, `plan`, or
   `unsupported` response.
4. The server and browser both validate any returned plan.
5. The existing OS-DPI authoring command applies the plan locally only after
   the user reviews it and clicks **Apply plan**.

The panel supports both:

```text
Create an auto-scan interface where Enter selects the current button.
```

and:

```text
I want a complex SGD interface with qwerty keyboard and also some Core vocabulary. The user should be able to see what they are composing via display and be able to delete or clear things.
```

An API key can be configured in the Vite server environment or pasted into the
masked development field. A pasted key stays only in page memory, is sent to
the loopback server in an `Authorization` header, and is cleared by reloading.
It is never included in the conversation body, status output, or plan preview.
The local endpoint does not write IndexedDB, construct OS-DPI JSON, or apply
any design changes.

The endpoint is installed as development middleware in the existing Vite
server, so there is no second server process to run.

### Mock provider

If `AUTHORING_PROVIDER` is unset, the server uses the deterministic mock
provider.

```sh
npm run start
```

### OpenAI provider

Set environment variables from `src/`:

```sh
AUTHORING_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.5
npm run start
```

`OPENAI_MODEL` is optional and defaults to `gpt-5.5`. You may put these values
in `src/.env.local`, which is ignored by Git.

### OpenRouter provider

OpenRouter uses its OpenAI-compatible chat completions endpoint with Bearer
authentication. Structured output support depends on the selected model; when
the model rejects `response_format: json_schema`, the provider retries with a
strict JSON-only prompt and still validates the returned plan locally.

```sh
AUTHORING_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=http://127.0.0.1:8080
OPENROUTER_TITLE="OS-DPI Authoring Dev"
npm run start
```

`OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_HTTP_REFERER`, and
`OPENROUTER_TITLE` are optional. `OPENROUTER_MODEL` defaults to
`openrouter/free`; free model availability and structured output support may
vary.

Then open:

```text
http://127.0.0.1:8080/OS-DPI/?authoring=llm
```

Use **Generate with LLM** to request and inspect a plan. **Apply plan** remains
disabled during clarification and until validation passes. Sending another
message clears the pending plan and requires a fresh review.

If `AUTHORING_PROVIDER` is `openai` but `OPENAI_API_KEY` is missing, or
`openrouter` but `OPENROUTER_API_KEY` is missing, the server explicitly falls
back to mock and returns a warning shown in the status area.

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

- Only `configure_auto_scan` and `create_sgd_interface` are supported.
- Arbitrary OS-DPI JSON generation is rejected.
- Arbitrary CSS, class names, JavaScript, HTML, and model-authored action
  expressions are rejected.
- Full general interface design is not supported.
- SGD auto-scan settings are not generated yet; auto-scan remains a separate
  operation.
- No model is fine-tuned.
- Cloud API mode is for local development only until a production server and
  authentication design exist.
- Conversation history, pasted keys, and pending plans are memory-only.
- The chat is constrained to these authoring plans; it is not a general-purpose
  assistant.
