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
