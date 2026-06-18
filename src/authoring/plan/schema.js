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
