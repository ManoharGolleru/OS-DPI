export const AUTO_SCAN_PLAN_KEYS = [
  "operation",
  "startKey",
  "selectKey",
  "intervalSeconds",
  "restartAfterSelection",
  "buttonLabels",
];

export const SGD_KEYBOARD_KEYS = [
  "type",
  "includeSpace",
  "includeDelete",
  "includeClear",
];

export const SGD_ACTION_KEYS = [
  "lettersAppendToDisplay",
  "coreWordsAppendToDisplay",
  "deleteRemovesLastCharacter",
  "clearEmptiesDisplay",
  "speakUsesDisplay",
];

export const SGD_PLAN_KEYS = [
  "operation",
  "title",
  "displayState",
  "keyboard",
  "coreVocabulary",
  "actions",
];

export const PLAN_OPERATIONS = [
  "configure_auto_scan",
  "create_sgd_interface",
];

export const AUTO_SCAN_PLAN_SCHEMA = {
  type: "object",
  properties: {
    operation: {
      type: "string",
      enum: ["configure_auto_scan"],
    },
    startKey: {
      type: "string",
      minLength: 1,
    },
    selectKey: {
      type: "string",
      minLength: 1,
    },
    intervalSeconds: {
      type: "number",
      exclusiveMinimum: 0,
    },
    restartAfterSelection: {
      type: "boolean",
    },
    buttonLabels: {
      type: "array",
      minItems: 2,
      items: {
        type: "string",
        minLength: 1,
      },
    },
  },
  required: AUTO_SCAN_PLAN_KEYS,
  additionalProperties: false,
};

export const SGD_PLAN_SCHEMA = {
  type: "object",
  properties: {
    operation: {
      type: "string",
      enum: ["create_sgd_interface"],
    },
    title: {
      type: "string",
      minLength: 1,
    },
    displayState: {
      type: "string",
      pattern: "^\\$",
    },
    keyboard: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["qwerty"],
        },
        includeSpace: {
          type: "boolean",
        },
        includeDelete: {
          type: "boolean",
        },
        includeClear: {
          type: "boolean",
        },
      },
      required: SGD_KEYBOARD_KEYS,
      additionalProperties: false,
    },
    coreVocabulary: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "string",
        minLength: 1,
      },
    },
    actions: {
      type: "object",
      properties: {
        lettersAppendToDisplay: {
          type: "boolean",
        },
        coreWordsAppendToDisplay: {
          type: "boolean",
        },
        deleteRemovesLastCharacter: {
          type: "boolean",
        },
        clearEmptiesDisplay: {
          type: "boolean",
        },
        speakUsesDisplay: {
          type: "boolean",
        },
      },
      required: SGD_ACTION_KEYS,
      additionalProperties: false,
    },
  },
  required: SGD_PLAN_KEYS,
  additionalProperties: false,
};

export const MODEL_AUTO_SCAN_PLAN_SCHEMA = {
  ...AUTO_SCAN_PLAN_SCHEMA,
  properties: {
    ...AUTO_SCAN_PLAN_SCHEMA.properties,
    startKey: {
      anyOf: [AUTO_SCAN_PLAN_SCHEMA.properties.startKey, { type: "null" }],
    },
    selectKey: {
      anyOf: [AUTO_SCAN_PLAN_SCHEMA.properties.selectKey, { type: "null" }],
    },
    intervalSeconds: {
      anyOf: [
        AUTO_SCAN_PLAN_SCHEMA.properties.intervalSeconds,
        { type: "null" },
      ],
    },
  },
};

export const MODEL_PLAN_SCHEMA = {
  anyOf: [MODEL_AUTO_SCAN_PLAN_SCHEMA, SGD_PLAN_SCHEMA],
};

export const OPENAI_PLANNER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["clarification", "plan", "unsupported"],
    },
    message: {
      type: "string",
      minLength: 1,
    },
    plan: {
      anyOf: [MODEL_PLAN_SCHEMA, { type: "null" }],
    },
  },
  required: ["kind", "message", "plan"],
  additionalProperties: false,
};
