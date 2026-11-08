import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ToolArgsEditor } from "../components/tools/tool-args-editor";

type Schema = Record<string, unknown>;

/** Stateful host mirroring ToolPanel: the store holds the Call arguments. */
function renderEditor(schema: Schema, initial: Record<string, unknown> = {}) {
  const onValidChange = vi.fn();
  const latest = { values: initial };
  function Host() {
    const [values, setValues] = useState(initial);
    latest.values = values;
    return (
      <ToolArgsEditor
        schema={schema}
        args={values}
        onChange={setValues}
        onValidChange={onValidChange}
      />
    );
  }
  render(<Host />);
  return { onValidChange, args: () => latest.values };
}

describe("enum fields", () => {
  const schema: Schema = {
    type: "object",
    properties: { level: { type: "string", enum: ["debug", "info", "warn"] } },
  };

  it("renders a select listing every enum member and sends the chosen one", async () => {
    const { args } = renderEditor(schema);
    const select = screen.getByRole("combobox", { name: /level/i });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(
      expect.arrayContaining(["debug", "info", "warn"]),
    );

    await userEvent.selectOptions(select, "warn");

    expect(args()).toEqual({ level: "warn" });
  });
});

describe("array of primitives", () => {
  const schema: Schema = {
    type: "object",
    properties: { tags: { type: "array", items: { type: "string" } } },
  };

  it("adds items, edits them and removes one", async () => {
    const { args } = renderEditor(schema);

    await userEvent.click(screen.getByRole("button", { name: /add tags item/i }));
    await userEvent.click(screen.getByRole("button", { name: /add tags item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "tags item 1" }), "red");
    await userEvent.type(screen.getByRole("textbox", { name: "tags item 2" }), "blue");
    expect(args()).toEqual({ tags: ["red", "blue"] });

    await userEvent.click(screen.getByRole("button", { name: "Remove tags item 1" }));

    expect(args()).toEqual({ tags: ["blue"] });
    expect(screen.getByRole("textbox", { name: "tags item 1" })).toHaveValue("blue");
  });

  it("types numeric items as numbers", async () => {
    const numbers: Schema = {
      type: "object",
      properties: { ids: { type: "array", items: { type: "integer" } } },
    };
    const { args } = renderEditor(numbers);

    await userEvent.click(screen.getByRole("button", { name: /add ids item/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "ids item 1" }), "42");

    expect(args()).toEqual({ ids: [42] });
  });
});

describe("nested object", () => {
  const schema: Schema = {
    type: "object",
    properties: {
      options: {
        type: "object",
        description: "Delivery options",
        required: ["retries"],
        properties: {
          retries: { type: "integer" },
          mode: { type: "string", enum: ["fast", "safe"] },
          labels: { type: "array", items: { type: "string" } },
        },
      },
    },
  };

  it("groups child fields under the object and writes a nested value", async () => {
    const { args } = renderEditor(schema);

    const group = screen.getByRole("group", { name: /options/i });
    expect(group).toBeInTheDocument();
    await userEvent.type(within(group).getByRole("spinbutton", { name: "retries" }), "3");
    await userEvent.selectOptions(within(group).getByRole("combobox", { name: "mode" }), "safe");
    await userEvent.click(within(group).getByRole("button", { name: /add labels item/i }));
    await userEvent.type(within(group).getByRole("textbox", { name: "labels item 1" }), "x");

    expect(args()).toEqual({ options: { retries: 3, mode: "safe", labels: ["x"] } });
  });

  it("drops the object when its last child is cleared", async () => {
    const { args } = renderEditor(schema, { options: { retries: 3 } });

    await userEvent.clear(screen.getByRole("spinbutton", { name: "retries" }));

    expect(args()).toEqual({});
  });
});

describe("required markers", () => {
  const schema: Schema = {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
      limit: { type: "integer" },
      options: {
        type: "object",
        required: ["retries"],
        properties: { retries: { type: "integer" }, mode: { type: "string" } },
      },
    },
  };

  it("marks required fields at the top level and inside a group", () => {
    renderEditor(schema);

    expect(screen.getByText("query").querySelector('[aria-label="required"]')).not.toBeNull();
    expect(screen.getByText("limit").querySelector('[aria-label="required"]')).toBeNull();
    const group = screen.getByRole("group", { name: /options/i });
    expect(within(group).getByText("retries").querySelector('[aria-label="required"]')).not.toBeNull();
    expect(within(group).getByText("mode").querySelector('[aria-label="required"]')).toBeNull();
  });
});

const richSchema: Schema = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string" },
    level: { type: "string", enum: ["debug", "info"] },
    tags: { type: "array", items: { type: "string" } },
    options: {
      type: "object",
      properties: { retries: { type: "integer" } },
    },
  },
};

describe("form / JSON toggle", () => {
  it("round-trips form → JSON → form without losing values", async () => {
    const { args } = renderEditor(richSchema);
    await userEvent.type(screen.getByRole("textbox", { name: "query" }), "hello");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "level" }), "info");
    await userEvent.click(screen.getByRole("button", { name: /add tags item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "tags item 1" }), "a");
    await userEvent.type(screen.getByRole("spinbutton", { name: "retries" }), "2");
    const expected = { query: "hello", level: "info", tags: ["a"], options: { retries: 2 } };

    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual(expected);

    await userEvent.click(screen.getByRole("button", { name: "Form" }));
    expect(screen.getByRole("textbox", { name: "query" })).toHaveValue("hello");
    expect(screen.getByRole("combobox", { name: "level" })).toHaveValue(
      String(["debug", "info"].indexOf("info")),
    );
    expect(screen.getByRole("textbox", { name: "tags item 1" })).toHaveValue("a");
    expect(screen.getByRole("spinbutton", { name: "retries" })).toHaveValue(2);
    expect(args()).toEqual(expected);
  });

  it("carries JSON edits, including keys outside the schema, back to the form", async () => {
    const { args } = renderEditor(richSchema);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query":"q","extra":{"n":1},"tags":["x","y"]}');
    await userEvent.click(screen.getByRole("button", { name: "Form" }));

    expect(screen.getByRole("textbox", { name: "query" })).toHaveValue("q");
    expect(screen.getByRole("textbox", { name: "tags item 2" })).toHaveValue("y");
    expect(args()).toEqual({ query: "q", extra: { n: 1 }, tags: ["x", "y"] });
  });

  it("shows an inline error for invalid JSON, reports invalid and blocks leaving JSON mode", async () => {
    const { onValidChange } = renderEditor(richSchema);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query": ');

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid json/i);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Form" })).toBeDisabled();

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query":"ok"}');

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onValidChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Form" })).toBeEnabled();
  });

  it("rejects JSON that is not an object", async () => {
    const { onValidChange } = renderEditor(richSchema);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste("[1,2]");

    expect(screen.getByRole("alert")).toHaveTextContent(/must be a json object/i);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });
});

describe("deeper schemas", () => {
  const deep: Schema = {
    type: "object",
    properties: {
      config: {
        type: "object",
        properties: {
          inner: { type: "object", properties: { n: { type: "integer" } } },
        },
      },
      rows: {
        type: "array",
        items: { type: "object", properties: { id: { type: "integer" } } },
      },
    },
  };

  it("falls back to a JSON editor for the field that is too deep", async () => {
    const { args } = renderEditor(deep);

    const group = screen.getByRole("group", { name: /config/i });
    const inner = within(group).getByRole("textbox", { name: "inner" });
    await userEvent.click(inner);
    await userEvent.paste('{"n":5}');
    const rows = screen.getByRole("textbox", { name: "rows" });
    await userEvent.click(rows);
    await userEvent.paste('[{"id":1}]');

    expect(args()).toEqual({ config: { inner: { n: 5 } }, rows: [{ id: 1 }] });
  });

  it("flags invalid JSON in a fallback field and blocks Run", async () => {
    const { onValidChange } = renderEditor(deep);
    const rows = screen.getByRole("textbox", { name: "rows" });
    await userEvent.click(rows);
    await userEvent.paste("[{");

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid json/i);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });
});

async function pasteJson(text: string) {
  await userEvent.click(screen.getByRole("button", { name: "JSON" }));
  const editor = screen.getByRole("textbox", { name: /arguments json/i });
  await userEvent.clear(editor);
  await userEvent.click(editor);
  await userEvent.paste(text);
  return editor as HTMLTextAreaElement;
}

describe("value fidelity", () => {
  const schema: Schema = {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: ["integer", "null"] },
    },
  };

  it("keeps explicit empty strings and nulls through JSON → form → JSON", async () => {
    const { args } = renderEditor(schema);
    const text = '{"query":"","limit":null}';

    await pasteJson(text);
    expect(args()).toEqual({ query: "", limit: null });

    await userEvent.click(screen.getByRole("button", { name: "Form" }));
    expect(args()).toEqual({ query: "", limit: null });
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(editor.value)).toEqual({ query: "", limit: null });
  });

  it("still treats a cleared form field as unset", async () => {
    const { args } = renderEditor(schema);
    await userEvent.type(screen.getByRole("textbox", { name: "query" }), "x");
    await userEvent.clear(screen.getByRole("textbox", { name: "query" }));

    expect(args()).toEqual({});
  });

  it("sends the enum member with its own type, not its text", async () => {
    const numeric: Schema = { type: "object", properties: { n: { enum: [1, 2] } } };
    const { args } = renderEditor(numeric);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "n" }), "2");

    expect(args()).toEqual({ n: 2 });
  });

  it("sends parsed JSON from a fallback field without a declared type", async () => {
    const composite: Schema = {
      type: "object",
      properties: { x: { anyOf: [{ type: "object" }, { type: "string" }] } },
    };
    const { args } = renderEditor(composite);

    await userEvent.click(screen.getByRole("textbox", { name: "x" }));
    await userEvent.paste('{"a":1}');

    expect(args()).toEqual({ x: { a: 1 } });
  });

  it("round-trips typed values for properties without a declared type", async () => {
    const loose: Schema = { type: "object", properties: { v: {} } };
    const { args } = renderEditor(loose);

    await pasteJson('{"v":"123","w":"true"}');

    expect(args()).toEqual({ v: "123", w: "true" });
  });
});

describe("integer array item left blank", () => {
  const schema: Schema = {
    type: "object",
    properties: { ids: { type: "array", items: { type: "integer" } } },
  };

  it("keeps the blank draft, flags it, and blocks Run until corrected or removed", async () => {
    const { args, onValidChange } = renderEditor(schema);
    await userEvent.click(screen.getByRole("button", { name: /add ids item/i }));
    await userEvent.click(screen.getByRole("button", { name: /add ids item/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "ids item 2" }), "7");

    await userEvent.clear(screen.getByRole("spinbutton", { name: "ids item 1" }));

    expect(screen.getByRole("spinbutton", { name: "ids item 1" })).toHaveValue(null);
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a value or remove/i);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(JSON.stringify(args())).not.toContain("null");

    await userEvent.type(screen.getByRole("spinbutton", { name: "ids item 1" }), "5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onValidChange).toHaveBeenLastCalledWith(true);
    expect(args()).toEqual({ ids: [5, 7] });

    await userEvent.clear(screen.getByRole("spinbutton", { name: "ids item 1" }));
    expect(onValidChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Remove ids item 1" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onValidChange).toHaveBeenLastCalledWith(true);
    expect(args()).toEqual({ ids: [7] });
  });

  it("keeps a cleared string item as an empty string", async () => {
    const strings: Schema = {
      type: "object",
      properties: { tags: { type: "array", items: { type: "string" } } },
    };
    const { args } = renderEditor(strings);
    await userEvent.click(screen.getByRole("button", { name: /add tags item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "tags item 1" }), "a");
    await userEvent.clear(screen.getByRole("textbox", { name: "tags item 1" }));

    expect(args()).toEqual({ tags: [""] });
  });
});
