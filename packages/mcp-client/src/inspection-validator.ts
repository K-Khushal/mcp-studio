import type { jsonSchemaValidator, JsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";

// Studio inspects invalid server output; Pretty owns schema validation feedback.
export const inspectionValidator: jsonSchemaValidator = {
  getValidator<T>(): JsonSchemaValidator<T> {
    return (input) => ({ valid: true, data: input as T, errorMessage: undefined });
  },
};
