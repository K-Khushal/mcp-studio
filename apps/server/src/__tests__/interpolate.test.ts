import { expect, test } from "bun:test";
import { interpolate } from "../env/interpolate";

test("resolver substitutes a single Variable", () => {
  expect(interpolate("Hello {{NAME}}", { NAME: "Ada" })).toEqual({ result: "Hello Ada", missing: [] });
});

test("resolver resolves nested objects and arrays and reports unique missing Variables", () => {
  const input = { command: "{{COMMAND}}", args: ["{{EMPTY}}", { value: "{{NAME}}/{{NAME}}/{{MISSING}}/{{MISSING}}" }], enabled: true, count: 1, nil: null };
  expect(interpolate(input, { COMMAND: "bun", EMPTY: "", NAME: "Ada" })).toEqual({
    result: { command: "bun", args: ["", { value: "Ada/Ada/{{MISSING}}/{{MISSING}}" }], enabled: true, count: 1, nil: null }, missing: ["MISSING"],
  });
  expect(input.command).toBe("{{COMMAND}}");
});

test("lowercase names are Variable references", () => {
  expect(interpolate("{{foo}}", { foo: "value" })).toEqual({ result: "value", missing: [] });
});

test("missing Variable in a top-level string is reported", () => {
  expect(interpolate("{{MISSING}}", {})).toEqual({ result: "{{MISSING}}", missing: ["MISSING"] });
});

test("whitespace inside braces is literal", () => {
  expect(interpolate("{{ NAME }}", { NAME: "Ada" })).toEqual({ result: "{{ NAME }}", missing: [] });
});

test("inherited property names are missing Variables", () => {
  expect(interpolate("{{constructor}}/{{toString}}", {})).toEqual({
    result: "{{constructor}}/{{toString}}", missing: ["constructor", "toString"],
  });
});

test("empty Variable values resolve", () => {
  expect(interpolate("{{EMPTY}}", { EMPTY: "" })).toEqual({ result: "", missing: [] });
});
