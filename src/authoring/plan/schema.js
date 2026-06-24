export const AUTO_SCAN_PLAN_KEYS = [
  "operation",
  "startKey",
  "selectKey",
  "intervalSeconds",
  "restartAfterSelection",
  "buttonLabels",
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
      anyOf: [MODEL_AUTO_SCAN_PLAN_SCHEMA, { type: "null" }],
    },
  },
  required: ["kind", "message", "plan"],
  additionalProperties: false,
};
