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
