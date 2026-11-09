import { describe, expect, it } from "vitest";
import { formatFrame, formatMcpLogMessage, mapMcpLogLevel } from "../log.js";

describe("mapMcpLogLevel", () => {
  it.each([
    ["debug", "DEBUG"],
    ["info", "INFO"],
    ["notice", "INFO"],
    ["warning", "WARN"],
    ["error", "ERROR"],
    ["critical", "ERROR"],
    ["alert", "ERROR"],
    ["emergency", "ERROR"],
    ["unheard-of", "INFO"],
  ])("%s → %s", (level, expected) => expect(mapMcpLogLevel(level)).toBe(expected));
});

describe("formatMcpLogMessage", () => {
  it("prefixes the logger and serialises structured data", () => {
    expect(formatMcpLogMessage({ logger: "db", data: "ready" })).toBe("[db] ready");
    expect(formatMcpLogMessage({ data: { rows: 2 } })).toBe('{"rows":2}');
  });
});

describe("formatFrame", () => {
  it("shows direction, method and id", () => {
    expect(formatFrame({ direction: "out", method: "tools/call", id: 3, body: {} }, false)).toBe("→ tools/call #3");
    expect(formatFrame({ direction: "in", method: "tools/call", id: 3, body: {} }, true)).toBe("← tools/call response #3");
    expect(formatFrame({ direction: "in", method: "notifications/message", body: {} }, false)).toBe("← notifications/message");
  });
});
