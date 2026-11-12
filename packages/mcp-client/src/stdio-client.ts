import { rememberConnectionSecrets } from "./diagnostics.js";
import { BoundedLines, StderrEntries } from "./limits.js";
import { inspectionValidator } from "./inspection-validator.js";
import { StringDecoder } from "node:string_decoder";
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
  protected readonly transportPhase = "spawn" as const;
  private transport: StdioClientTransport | null = null;
  private stderrHandler: ((chunk: Buffer) => void) | null = null;

  private stderrDecoder = new StringDecoder("utf8");
  private stderrEntries = new StderrEntries(entry => this.options.onLog?.("INFO", "server", entry));
  private stderrLines = new BoundedLines(line => this.stderrEntries.push(line));

  constructor(
    private readonly config: StdioConfig,
    options: MCPClientOptions = {}
  ) {
    super(options);
    rememberConnectionSecrets({ transport: "stdio", config }, this.diagnosticSecrets);
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
    this.stderrDecoder = new StringDecoder("utf8");
    this.stderrEntries = new StderrEntries(entry => this.options.onLog?.("INFO", "server", entry));
    this.stderrLines = new BoundedLines(line => this.stderrEntries.push(line));
    this.stderrHandler = (chunk: Buffer) => this.stderrLines.write(this.stderrDecoder.write(chunk));
    this.transport.stderr?.on("data", this.stderrHandler);

    const client = new Client({ name: "mcp-studio", version: "0.0.1" }, { jsonSchemaValidator: inspectionValidator, capabilities: { elicitation: { form: {} } } });
    this.options.onLog?.("INFO", "studio", "Connecting via STDIO transport…");
    await this.connectTransport(client, this.transport);
    this.options.onLog?.("INFO", "studio", "MCP initialize handshake complete");
    return client;
  }

  protected override flushDiagnostics(): void {
    this.stderrLines.write(this.stderrDecoder.end());
    this.stderrLines.flush();
    this.stderrEntries.flush();
  }

  protected async teardownTransport(): Promise<void> {
    if (this.stderrHandler) {
      this.transport?.stderr?.off("data", this.stderrHandler);
      this.stderrHandler = null;
      this.flushDiagnostics();
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
