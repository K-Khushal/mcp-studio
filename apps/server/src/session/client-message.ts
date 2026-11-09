import type { ClientMessage, ServerMessage } from "@mcp-studio/types";

type Check = (value: unknown) => boolean;
const string: Check = value => typeof value === "string";
const boolean: Check = value => typeof value === "boolean";
const number: Check = value => typeof value === "number" && Number.isFinite(value);
const object: Check = value => typeof value === "object" && value !== null && !Array.isArray(value);
const optional = (check: Check): Check => value => value === undefined || check(value);
const oneOf = (...values: string[]): Check => value => typeof value === "string" && values.includes(value);

/** Required and optional top-level fields per `ClientMessage` type; deeper values are checked by their handlers. */
const SHAPES: Record<ClientMessage["type"], Record<string, Check>> = {
  elicitation_response: { elicitationId: string, action: oneOf("accept", "decline", "cancel"), content: optional(object) },
  connect: { transport: oneOf("stdio", "http"), config: object, verbose: optional(boolean), connectionId: optional(string) },
  set_verbose: { verbose: boolean },
  cancel: { requestId: string },
  invoke: { tool: string, params: object, requestId: optional(string), requestTimeout: optional(number) },
  invoke_prompt: { prompt: string, args: object, requestId: optional(string), requestTimeout: optional(number) },
  disconnect: {},
  list_tools: {},
  list_prompts: {},
};

const CONFIG_SHAPES: Record<"stdio" | "http", Record<string, Check>> = {
  stdio: { command: string, args: optional(value => Array.isArray(value) && value.every(string)), env: optional(object), cwd: optional(string), inheritSystemEnv: optional(boolean) },
  http: { url: string, headers: optional(object), auth: optional(object) },
};

type ProtocolError = Extract<ServerMessage, { type: "error" }>;

function protocolError(message: string, requestId?: unknown): ProtocolError {
  return { type: "error", code: "PROTOCOL_ERROR", message, ...(typeof requestId === "string" ? { requestId } : {}) };
}

function invalidField(value: Record<string, unknown>, shape: Record<string, Check>): string | undefined {
  return Object.keys(shape).find(field => !shape[field]!(value[field]));
}

/** Parses one WebSocket frame from the browser; any JSON that is not a well-formed `ClientMessage` becomes an error reply. */
export function parseClientMessage(raw: string): { message: ClientMessage } | { error: ProtocolError } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { error: { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" } }; }
  if (!object(value)) return { error: protocolError("Message must be a JSON object") };
  const message = value as Record<string, unknown>;
  const type = message["type"];
  if (typeof type !== "string" || !Object.hasOwn(SHAPES, type)) return { error: protocolError(typeof type === "string" ? `Unknown message type: ${type.slice(0, 64)}` : "Message type must be a string") };
  const field = invalidField(message, SHAPES[type as ClientMessage["type"]]);
  if (field) return { error: protocolError(`Invalid ${type} message: bad ${field}`, message["requestId"]) };
  if (type === "connect") {
    const configField = invalidField(message["config"] as Record<string, unknown>, CONFIG_SHAPES[message["transport"] as "stdio" | "http"]);
    if (configField) return { error: protocolError(`Invalid connect message: bad config.${configField}`) };
  }
  return { message: message as unknown as ClientMessage };
}
