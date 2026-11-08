import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { LogPayload } from "@mcp-studio/types";
import type { MCPClientOptions } from "../types.js";
import { BaseMCPClient } from "../base-client.js";

/** A peer that sends a ping with the same id as the client's pending tools/list. */
class PingPeer implements Transport {
  onmessage?: Transport["onmessage"];
  onclose?: Transport["onclose"];
  private toolsId?: string | number;
  async start() {}
  async close() { this.onclose?.(); }
  async send(message: JSONRPCMessage) {
    if (!("id" in message)) return;
    const { id } = message;
    if (id === undefined) return;
    if ("method" in message) {
      if (message.method === "initialize") {
        this.onmessage?.({ jsonrpc: "2.0", id, result: {
          protocolVersion: "2025-06-18", capabilities: { tools: {}, prompts: {} }, serverInfo: { name: "ping-peer", version: "1" },
        } });
      } else if (message.method === "tools/list") {
        this.toolsId = id;
        this.onmessage?.({ jsonrpc: "2.0", id, method: "ping" });
      } else if (message.method === "prompts/list") {
        this.onmessage?.({ jsonrpc: "2.0", id, result: { prompts: [] } });
      }
    } else if (id === this.toolsId) {
      this.onmessage?.({ jsonrpc: "2.0", id, result: { tools: [] } });
    }
  }
}

class TestClient extends BaseMCPClient {
  private transport = new PingPeer();
  constructor(options: MCPClientOptions) { super(options); }
  protected async setupTransport() {
    const client = new Client({ name: "test", version: "1" });
    await this.connectTransport(client, this.transport);
    return client;
  }
  protected async teardownTransport() { await this.transport.close(); }
}

it("correlates responses independently in both directions when request ids overlap", async () => {
  const frames: LogPayload[] = [];
  const client = new TestClient({ verbose: true, onLog: (_level, _source, _text, payload) => { if (payload) frames.push(payload); } });
  try {
    await client.connect();
    const ping = frames.find(frame => frame.direction === "out" && frame.method === "ping");
    const tools = frames.find(frame => frame.direction === "in" && frame.method === "tools/list");
    expect(ping).toBeDefined();
    expect(tools).toBeDefined();
    expect(ping?.id).toBe(tools?.id);
  } finally { await client.disconnect(); }
});

it("delivers frames even when the protocol log callback throws", async () => {
  const client = new TestClient({ verbose: true, onLog: (_level, source) => { if (source === "protocol") throw new Error("log sink failed"); } });
  try {
    expect(await client.connect()).toMatchObject({ serverName: "ping-peer", tools: [], prompts: [] });
  } finally { await client.disconnect(); }
});
