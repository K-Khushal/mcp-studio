import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioConfig } from "@mcp-studio/types";
import type { MCPClientOptions } from "./types.js";
import { BaseMCPClient } from "./base-client.js";

/**
 * MCP client over STDIO transport.
 * Spawns the MCP server process; all protocol logic lives in BaseMCPClient.
 */
export class StdioMCPClient extends BaseMCPClient {
  private transport: StdioClientTransport | null = null;
  private stderrHandler: ((chunk: Buffer) => void) | null = null;

  constructor(
    private readonly config: StdioConfig,
    options: MCPClientOptions = {}
  ) {
    super(options);
  }

  protected async setupTransport(): Promise<Client> {
    const env = this.config.inheritSystemEnv
      ? { ...process.env, ...this.config.env }
      : { ...this.config.env };

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: env as Record<string, string>,
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
      stderr: "pipe",
    });

    // Forward subprocess stderr to the UI so startup messages are visible.
    this.stderrHandler = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        const trimmed = line.trim();
        if (trimmed) this.options.onLog?.("INFO", "subprocess", trimmed);
      }
    };
    this.transport.stderr?.on("data", this.stderrHandler);

    const client = new Client({ name: "mcp-studio", version: "0.0.1" });
    this.options.onLog?.("INFO", "protocol", "Connecting via STDIO transport…");
    await client.connect(this.transport);
    this.options.onLog?.("INFO", "protocol", "MCP initialize handshake complete");
    return client;
  }

  protected async teardownTransport(): Promise<void> {
    if (this.stderrHandler) {
      this.transport?.stderr?.off("data", this.stderrHandler);
      this.stderrHandler = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
