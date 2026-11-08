import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PrettyTab } from "../components/response/pretty-tab";
afterEach(cleanup);
const schema = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false };
it("renders structured output and reports that it matches the output schema", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: 42 } }} error={null} outputSchema={schema} />);
  expect(screen.getByText("42")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Matches output schema");
  expect(screen.queryByText("Empty response")).not.toBeInTheDocument();
});
it("flags a type mismatch while keeping structured data and text visible", () => {
  render(<PrettyTab result={{ content: [{ type: "text", text: "Original response" }], structuredContent: { answer: "wrong" } }} error={null} outputSchema={schema} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/output schema mismatch.*answer.*number/i);
  expect(screen.getByText('"wrong"')).toBeVisible();
  expect(screen.getByText("Original response")).toBeVisible();
});
it("flags missing required structured content", () => {
  render(<PrettyTab result={{ content: [] }} error={null} outputSchema={schema} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/structured content is missing/i);
});
it("renders structured content without a schema without claiming validation", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: 42 } }} error={null} />);
  expect(screen.getByText("42")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("reports an unusable schema without crashing", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: 42 } }} error={null} outputSchema={{ type: "invalid" }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Cannot validate output schema");
  expect(screen.getByText("42")).toBeVisible();
});
it("validates nested constraints, references, and 2020-12 schemas", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: 42 } }} error={null} outputSchema={{
    $schema: "https://json-schema.org/draft/2020-12/schema", type: "object",
    $defs: { answer: { type: "number", maximum: 40 } }, properties: { answer: { $ref: "#/$defs/answer" } },
  }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/answer.*<= 40/);
});
it("preserves tool error rendering without a spurious missing-content warning", () => {
  render(<PrettyTab result={{ content: [{ type: "text", text: "Failed" }], isError: true }} error={null} outputSchema={schema} />);
  expect(screen.getByText("Tool execution error")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("defaults to 2020-12 and flags a prefixItems mismatch", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { values: [42] } }} error={null} outputSchema={{
    type: "object", properties: { values: { type: "array", prefixItems: [{ type: "string" }] } },
  }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/output schema mismatch.*values\/0.*string/i);
});

it("uses explicit draft-07 tuple validation", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { values: [42] } }} error={null} outputSchema={{
    $schema: "http://json-schema.org/draft-07/schema#", type: "object",
    properties: { values: { type: "array", items: [{ type: "string" }] } },
  }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/output schema mismatch.*string/i);
});
it("does not claim validation for unsupported dialects", () => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: 42 } }} error={null} outputSchema={{
    $schema: "https://example.com/2020-12/custom", type: "object",
  }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Cannot validate output schema");
});
it("collapses a text mirror even when object keys have a different order", () => {
  const { container } = render(<PrettyTab result={{
    content: [{ type: "text", text: '{"nested":{"b":2,"a":[1]}}' }],
    structuredContent: { nested: { a: [1], b: 2 } },
  }} error={null} />);
  expect(screen.getByText("Content (text mirror)")).toBeVisible();
  expect(container.querySelector("details")).not.toHaveAttribute("open");
});

it.each([
  "http://json-schema.org/draft-07/schema",
  "http://json-schema.org/draft-07/schema#",
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2020-12/schema#",
])("validates dialect URI with an optional empty fragment: %s", ($schema) => {
  render(<PrettyTab result={{ content: [], structuredContent: { answer: "wrong" } }} error={null} outputSchema={{ ...schema, $schema }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/output schema mismatch.*answer.*number/i);
});
