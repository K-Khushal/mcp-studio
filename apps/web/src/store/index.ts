import { toast } from "sonner";
import type { ElicitationResult } from "@mcp-studio/types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  MCPTool,
  MCPPrompt,
  MCPConfig,
  ConnectionStatus,
  Collection,
  Connection,
  Environment,
  ServerMessage,
  ConnectionConfig,
  HttpAuth,
} from "@mcp-studio/types";
import { transport } from "@/transport/websocket-transport";
import { applyTheme, watchSystemTheme } from "@/lib/theme";
import { persistConfig, readPersistedConfig } from "./config";
import {
  DEFAULT_STDIO_DRAFT,
  stdioDraftFromCommandLine,
  stdioDraftFromConfig,
  type StdioDraft,
} from "./connection-form";

export const LOGS_MIN_HEIGHT = 96;
export const LOGS_DEFAULT_HEIGHT = 208;

export function clampLogsHeight(height: number, max: number): number {
  return Math.round(Math.min(Math.max(height, LOGS_MIN_HEIGHT), Math.max(max, LOGS_MIN_HEIGHT)));
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  source: "protocol" | "subprocess";
  message: string;
  timestamp: number;
}

interface ResponseState {
  chunks: unknown[];
  result: unknown | null;
  error: string | null;
  isStreaming: boolean;
  startedAt: number | null;
  completedAt: number | null;
  httpStatus: number | null;
  httpResponseHeaders: Record<string, string> | null;
}

interface TimelineStep {
  label: string;
  detail: string;
  timestamp: string;
  status: "completed" | "active" | "pending";
}

interface ConnectionDraft {
  transport: "stdio" | "http";
  connectionUrl: string;
  stdio?: StdioDraft;
  httpAuth?: HttpAuth;
  httpHeaders?: Record<string, string>;
}

interface ConnectionWorkspaceState {
  tools: MCPTool[];
  prompts: MCPPrompt[];
  selectedTool: MCPTool | null;
  selectedPrompt: MCPPrompt | null;
  toolSearch: string;
  promptSearch: string;
  pendingParams: Record<string, unknown> | null;
  toolFormValues: Record<string, unknown>;
  promptArgValues: Record<string, string>;
  response: ResponseState;
  timeline: TimelineStep[];
  logs: LogEntry[];
}

interface ConnectedConnectionCache extends ConnectionWorkspaceState {
  connectionId: string;
}

interface AppState {
  elicitations: Extract<ServerMessage, { type: "elicitation_request" }>[];
  // Connection
  connectionStatus: ConnectionStatus;
  connectionConfig: ConnectionConfig | null;
  serverInfo: { name?: string; version?: string } | null;
  protocolVersion: string | null;
  httpVariant?: "streamable" | "sse";
  connectedConnectionId: string | null;
  connectingConnectionId: string | null;
  connectedConnectionCache: ConnectedConnectionCache | null;

  // Tools & Prompts
  tools: MCPTool[];
  prompts: MCPPrompt[];
  selectedTool: MCPTool | null;
  selectedPrompt: MCPPrompt | null;
  toolSearch: string;
  promptSearch: string;
  pendingParams: Record<string, unknown> | null;
  toolFormValues: Record<string, unknown>;
  promptArgValues: Record<string, string>;

  // Response
  response: ResponseState;
  timeline: TimelineStep[];

  // Logs
  logs: LogEntry[];
  logIdCounter: number;

  // Collections
  collections: Collection[];
  selectedConnectionId: string | null;
  connectionDrafts: Record<string, ConnectionDraft>;

  // Connection form (persisted in store so panels stay in sync)
  transport: "stdio" | "http";
  /** HTTP endpoint URL; STDIO fields live in `stdio`. */
  connectionUrl: string;
  stdio: StdioDraft;
  httpAuth: HttpAuth;
  httpHeaders: Record<string, string>;

  // Environments
  environments: Environment[];
  activeEnvironmentId: string | null;

  // Configuration
  config: MCPConfig;

  // Metrics
  latency: number;
  requestCount: number;
  errorCount: number;
  connectedAt: number | null;

  // UI
  isLogsCollapsed: boolean;
  logsHeight: number;

}

interface AppActions {
  respondToElicitation: (elicitationId: string, result: ElicitationResult) => void;
  // Connection
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;

  // Tools
  selectTool: (tool: MCPTool | null) => void;
  setToolSearch: (q: string) => void;
  setToolFormValues: (values: Record<string, unknown>) => void;
  setPromptSearch: (q: string) => void;
  setPromptArgValues: (values: Record<string, string>) => void;

  // Prompts
  selectPrompt: (prompt: MCPPrompt | null) => void;

  // Invocation
  invokeTool: (tool: string, params: Record<string, unknown>) => Promise<void>;
  invokePrompt: (prompt: string, args: Record<string, string>) => Promise<void>;

  // Load a saved Connection into the workspace
  loadConnection: (connection: Connection) => void;
  clearPendingParams: () => void;

  // Logs
  clearLogs: () => void;

  // Collections
  loadCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addConnection: (collectionId: string, data: Omit<Connection, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  renameConnection: (collectionId: string, connId: string, name: string) => Promise<void>;
  updateConnectionConfig: (collectionId: string, connId: string, connectionConfig: ConnectionConfig) => Promise<void>;
  deleteConnection: (collectionId: string, connId: string) => Promise<void>;

  // Connection form
  setTransport: (t: "stdio" | "http") => void;
  setStdio: (patch: Partial<StdioDraft>) => void;
  setConnectionUrl: (url: string) => void;
  setHttpAuth: (auth: HttpAuth) => void;
  setHttpHeaders: (headers: Record<string, string>) => void;

  // Environments
  loadEnvironments: () => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  updateEnvironment: (id: string, partial: Partial<Pick<Environment, "name" | "variables" | "isActive">>) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id: string) => Promise<void>;

  // Configuration
  setConfig: (partial: Partial<MCPConfig>) => void;

  // UI
  toggleLogs: () => void;
  setLogsHeight: (height: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLANK_RESPONSE = {
  chunks: [] as unknown[],
  result: null,
  error: null,
  isStreaming: false,
  startedAt: null,
  completedAt: null,
  httpStatus: null,
  httpResponseHeaders: null,
} as const;

const DEFAULT_HTTP_AUTH: HttpAuth = { type: "none" };
const DEFAULT_HTTP_HEADERS: Record<string, string> = {};

const DEFAULT_CONNECTION_DRAFT: ConnectionDraft = {
  transport: "stdio",
  connectionUrl: "",
  stdio: DEFAULT_STDIO_DRAFT,
  httpAuth: DEFAULT_HTTP_AUTH,
  httpHeaders: DEFAULT_HTTP_HEADERS,
};

function createBlankWorkspace(): ConnectionWorkspaceState {
  return {
    tools: [],
    prompts: [],
    selectedTool: null,
    selectedPrompt: null,
    toolSearch: "",
    promptSearch: "",
    pendingParams: null,
    toolFormValues: {},
    promptArgValues: {},
    response: { ...BLANK_RESPONSE },
    timeline: [],
    logs: [],
  };
}

function cloneWorkspace(workspace: ConnectionWorkspaceState): ConnectionWorkspaceState {
  return {
    tools: [...workspace.tools],
    prompts: [...workspace.prompts],
    selectedTool: workspace.selectedTool,
    selectedPrompt: workspace.selectedPrompt,
    toolSearch: workspace.toolSearch,
    promptSearch: workspace.promptSearch,
    pendingParams: workspace.pendingParams ? { ...workspace.pendingParams } : null,
    toolFormValues: { ...workspace.toolFormValues },
    promptArgValues: { ...workspace.promptArgValues },
    response: {
      chunks: [...workspace.response.chunks],
      result: workspace.response.result,
      error: workspace.response.error,
      isStreaming: workspace.response.isStreaming,
      startedAt: workspace.response.startedAt,
      completedAt: workspace.response.completedAt,
      httpStatus: workspace.response.httpStatus,
      httpResponseHeaders: workspace.response.httpResponseHeaders,
    },
    timeline: [...workspace.timeline],
    logs: [...workspace.logs],
  };
}

function cloneConnectedCache(cache: ConnectedConnectionCache): ConnectedConnectionCache {
  return {
    connectionId: cache.connectionId,
    ...cloneWorkspace(cache),
  };
}

function connectionDraftFromConfig(config?: ConnectionConfig | null): ConnectionDraft | null {
  if (!config) return null;
  if (config.transport === "http") {
    return {
      transport: "http",
      connectionUrl: config.config.url,
      httpAuth: config.config.auth ?? DEFAULT_HTTP_AUTH,
      httpHeaders: config.config.headers ?? DEFAULT_HTTP_HEADERS,
    };
  }

  return {
    transport: "stdio",
    connectionUrl: "",
    stdio: stdioDraftFromConfig(config.config),
  };
}

function readPersistedConnectionDraft(): ConnectionDraft {
  try {
    const raw = localStorage.getItem("mcp-studio-connection");
    if (!raw) return { ...DEFAULT_CONNECTION_DRAFT };
    const parsed = JSON.parse(raw) as Partial<ConnectionDraft>;
    const transport = parsed.transport === "http" ? "http" : "stdio";
    return {
      transport,
      connectionUrl: transport === "http" ? parsed.connectionUrl ?? "" : "",
      stdio: parsed.stdio ?? (transport === "stdio" ? stdioDraftFromCommandLine(parsed.connectionUrl ?? "") : DEFAULT_STDIO_DRAFT),
      httpAuth: parsed.httpAuth ?? DEFAULT_HTTP_AUTH,
      httpHeaders: parsed.httpHeaders ?? DEFAULT_HTTP_HEADERS,
    };
  } catch {
    return { ...DEFAULT_CONNECTION_DRAFT };
  }
}

function persistConnectionDraft(draft: ConnectionDraft): void {
  try {
    localStorage.setItem("mcp-studio-connection", JSON.stringify(draft));
  } catch { /* Best-effort cleanup or persistence; retain in-memory state. */ }
}

function connectionWorkspacePatch(workspace: ConnectionWorkspaceState): Pick<
  AppState,
  | "tools"
  | "prompts"
  | "selectedTool"
  | "selectedPrompt"
  | "toolSearch"
  | "promptSearch"
  | "pendingParams"
  | "toolFormValues"
  | "promptArgValues"
  | "response"
  | "timeline"
  | "logs"
> {
  const clone = cloneWorkspace(workspace);
  return {
    tools: clone.tools,
    prompts: clone.prompts,
    selectedTool: clone.selectedTool,
    selectedPrompt: clone.selectedPrompt,
    toolSearch: clone.toolSearch,
    promptSearch: clone.promptSearch,
    pendingParams: clone.pendingParams,
    toolFormValues: clone.toolFormValues,
    promptArgValues: clone.promptArgValues,
    response: clone.response,
    timeline: clone.timeline,
    logs: clone.logs,
  };
}

function blankWorkspacePatch(): Pick<
  AppState,
  | "tools"
  | "prompts"
  | "selectedTool"
  | "selectedPrompt"
  | "toolSearch"
  | "promptSearch"
  | "pendingParams"
  | "toolFormValues"
  | "promptArgValues"
  | "response"
  | "timeline"
  | "logs"
> {
  return connectionWorkspacePatch(createBlankWorkspace());
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function syncConnectedWorkspace(
  state: AppState,
  updater: (workspace: ConnectionWorkspaceState) => ConnectionWorkspaceState
): Partial<AppState> {
  if (!state.connectedConnectionCache) return {};

  const nextWorkspace = updater(cloneWorkspace(state.connectedConnectionCache));
  const nextCache: ConnectedConnectionCache = {
    connectionId: state.connectedConnectionCache.connectionId,
    ...cloneWorkspace(nextWorkspace),
  };

  if (state.selectedConnectionId === state.connectedConnectionId) {
    return {
      connectedConnectionCache: nextCache,
      ...connectionWorkspacePatch(nextWorkspace),
    };
  }

  return { connectedConnectionCache: nextCache };
}

function buildConnectionDraftsPatch(
  selectedConnectionId: string | null,
  drafts: Record<string, ConnectionDraft>,
  draft: ConnectionDraft
): { connectionDrafts?: Record<string, ConnectionDraft> } {
  if (!selectedConnectionId) return {};
  return {
    connectionDrafts: {
      ...drafts,
      [selectedConnectionId]: { ...draft },
    },
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type { AppState };

export const useStore = create<AppState & AppActions>()(
  devtools(
    (set, get) => ({
      // ---------- initial state ----------
      respondToElicitation: (elicitationId, result) => {
        transport.send({ type: "elicitation_response", elicitationId, ...result });
        set(s => ({ elicitations: s.elicitations.filter(r => r.elicitationId !== elicitationId) }));
      },
      elicitations: [],
      connectionStatus: "disconnected",
      connectionConfig: null,
      serverInfo: null,
      protocolVersion: null,
      httpVariant: undefined,
      connectedConnectionId: null,
      connectingConnectionId: null,
      connectedConnectionCache: null,
      ...blankWorkspacePatch(),
      logIdCounter: 0,
      collections: [],
      selectedConnectionId: null,
      connectionDrafts: {},
      transport: readPersistedConnectionDraft().transport,
      connectionUrl: readPersistedConnectionDraft().connectionUrl,
      stdio: readPersistedConnectionDraft().stdio ?? DEFAULT_STDIO_DRAFT,
      httpAuth: readPersistedConnectionDraft().httpAuth ?? DEFAULT_HTTP_AUTH,
      httpHeaders: readPersistedConnectionDraft().httpHeaders ?? DEFAULT_HTTP_HEADERS,
      environments: [],
      config: readPersistedConfig(),
      activeEnvironmentId: null,
      latency: 0,
      requestCount: 0,
      errorCount: 0,
      connectedAt: null,
      isLogsCollapsed: true,
      logsHeight: LOGS_DEFAULT_HEIGHT,

      // ---------- connection ----------
      connect: async (config) => {
        const selectedConnectionId = get().selectedConnectionId;
        if (!selectedConnectionId) return;

        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          connectedConnectionId: null,
          connectingConnectionId: selectedConnectionId,
          connectedConnectionCache: null,
          connectionConfig: config,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectionStatus: "connecting",
          requestCount: 0,
          errorCount: 0,
          latency: 0,
          connectedAt: null,
        });

        if (transport.isConnected) {
          await transport.disconnect();
        }

        set({
          connectionConfig: config,
          connectionStatus: "connecting",
          connectingConnectionId: selectedConnectionId,
        });
        transport.onMessage(handleServerMessage);
        try {
          await transport.connect(config);
        } catch (err) {
          handleServerMessage({ type: "error", code: "CONNECTION_FAILED", message: err instanceof Error ? err.message : String(err) });
        }
      },

      disconnect: async () => {
        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          elicitations: [],
            connectionStatus: "disconnected",
          connectionConfig: null,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectedConnectionId: null,
          connectingConnectionId: null,
          connectedConnectionCache: null,
          requestCount: 0,
          errorCount: 0,
          latency: 0,
          connectedAt: null,
        });

        if (transport.isConnected) {
          await transport.disconnect();
        }
      },

      // ---------- tools ----------
      selectTool: (tool) =>
        set((s) => ({
          selectedTool: tool,
          selectedPrompt: null,
          pendingParams: null,
          toolFormValues: {},
          promptArgValues: {},
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            selectedTool: tool,
            selectedPrompt: null,
            pendingParams: null,
            toolFormValues: {},
            promptArgValues: {},
          })),
        })),
      setToolSearch: (q) =>
        set((s) => ({
          toolSearch: q,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            toolSearch: q,
          })),
        })),
      setToolFormValues: (values) =>
        set((s) => ({
          toolFormValues: { ...values },
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            toolFormValues: { ...values },
          })),
        })),
      setPromptSearch: (q) =>
        set((s) => ({
          promptSearch: q,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            promptSearch: q,
          })),
        })),
      setPromptArgValues: (values) =>
        set((s) => ({
          promptArgValues: { ...values },
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            promptArgValues: { ...values },
          })),
        })),

      // ---------- prompts ----------
      selectPrompt: (prompt) =>
        set((s) => ({
          selectedPrompt: prompt,
          selectedTool: null,
          pendingParams: null,
          promptArgValues: {},
          toolFormValues: {},
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            selectedPrompt: prompt,
            selectedTool: null,
            pendingParams: null,
            promptArgValues: {},
            toolFormValues: {},
          })),
        })),

      // ---------- invocation ----------
      invokeTool: async (tool, params) => {
        const state = get();
        if (state.connectionStatus !== "connected" || state.selectedConnectionId !== state.connectedConnectionId) {
          toast.error("Not connected", { description: "Connect the selected Connection first." });
          return;
        }

        const now = Date.now();
        const response: ResponseState = {
          chunks: [],
          result: null,
          error: null,
          isStreaming: true,
          startedAt: now,
          completedAt: null,
          httpStatus: null,
          httpResponseHeaders: null,
        };
        const timeline: TimelineStep[] = [
          { label: "Request sent", detail: `Tool: ${tool}`, timestamp: fmtTime(now), status: "completed" },
          { label: "Awaiting response", detail: "Waiting for server…", timestamp: fmtTime(now), status: "active" },
        ];

        set((s) => ({
          requestCount: s.requestCount + 1,
          response,
          timeline,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response,
            timeline,
          })),
        }));
        await transport.invoke(tool, params);
      },

      invokePrompt: async (prompt, args) => {
        const state = get();
        if (state.connectionStatus !== "connected" || state.selectedConnectionId !== state.connectedConnectionId) {
          toast.error("Not connected", { description: "Connect the selected Connection first." });
          return;
        }

        const now = Date.now();
        const response: ResponseState = {
          chunks: [],
          result: null,
          error: null,
          isStreaming: true,
          startedAt: now,
          completedAt: null,
          httpStatus: null,
          httpResponseHeaders: null,
        };
        const timeline: TimelineStep[] = [
          { label: "Request sent", detail: `Prompt: ${prompt}`, timestamp: fmtTime(now), status: "completed" },
          { label: "Awaiting response", detail: "Waiting for server…", timestamp: fmtTime(now), status: "active" },
        ];

        set((s) => ({
          requestCount: s.requestCount + 1,
          response,
          timeline,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response,
            timeline,
          })),
        }));
        await transport.invokePrompt(prompt, args);
      },

      // ---------- Connection loading ----------
      loadConnection: (connection) => {
        if (get().selectedConnectionId === connection.id) return;

        const state = get();
        const draft =
          state.connectionDrafts[connection.id] ??
          connectionDraftFromConfig(connection.connectionConfig) ??
          { ...DEFAULT_CONNECTION_DRAFT };

        persistConnectionDraft(draft);

        set({
          ...blankWorkspacePatch(),
          selectedConnectionId: connection.id,
          transport: draft.transport,
          connectionUrl: draft.connectionUrl,
          stdio: draft.stdio ?? DEFAULT_STDIO_DRAFT,
          httpAuth: draft.httpAuth ?? DEFAULT_HTTP_AUTH,
          httpHeaders: draft.httpHeaders ?? DEFAULT_HTTP_HEADERS,
          connectionDrafts: {
            ...state.connectionDrafts,
            [connection.id]: draft,
          },
        });
      },

      clearPendingParams: () =>
        set((s) => ({
          pendingParams: null,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            pendingParams: null,
          })),
        })),

      // ---------- logs ----------
      clearLogs: () =>
        set((s) => ({
          logs: [],
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            logs: [],
          })),
        })),

      // ---------- collections ----------
      loadCollections: async () => {
        const res = await fetch("/api/collections");
        const collections = (await res.json()) as Collection[];
        set({ collections });
      },

      createCollection: async (name) => {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const collection = (await res.json()) as Collection;
        set((s) => ({ collections: [...s.collections, collection] }));
      },

      renameCollection: async (id, name) => {
        await fetch(`/api/collections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c
          ),
        }));
      },

      deleteCollection: async (id) => {
        const wasConnected = (() => {
          const state = get();
          const deletedConnIds = new Set(
            state.collections.find((c) => c.id === id)?.connections.map((r) => r.id) ?? []
          );
          return deletedConnIds.has(state.connectedConnectionId ?? "");
        })();
        await fetch(`/api/collections/${id}`, { method: "DELETE" });
        if (wasConnected) {
          await get().disconnect();
        }
        set((s) => {
          const deletedConnIds = new Set(
            s.collections.find((c) => c.id === id)?.connections.map((r) => r.id) ?? []
          );
          const selectedConnectionDeleted = deletedConnIds.has(s.selectedConnectionId ?? "");
          const connectedConnectionDeleted = deletedConnIds.has(s.connectedConnectionId ?? "");
          const nextDrafts = { ...s.connectionDrafts };
          for (const rid of deletedConnIds) delete nextDrafts[rid];
          return {
            collections: s.collections.filter((c) => c.id !== id),
            selectedConnectionId: selectedConnectionDeleted ? null : s.selectedConnectionId,
            connectedConnectionId: connectedConnectionDeleted ? null : s.connectedConnectionId,
            connectingConnectionId: connectedConnectionDeleted ? null : s.connectingConnectionId,
            connectedConnectionCache: connectedConnectionDeleted ? null : s.connectedConnectionCache,
            connectionDrafts: nextDrafts,
            ...(selectedConnectionDeleted ? {
              ...blankWorkspacePatch(),
              transport: "stdio" as const,
              connectionUrl: "",
              stdio: DEFAULT_STDIO_DRAFT,
              httpAuth: DEFAULT_HTTP_AUTH,
              httpHeaders: DEFAULT_HTTP_HEADERS,
            } : {}),
          };
        });
      },

      addConnection: async (collectionId, data) => {
        const res = await fetch(`/api/collections/${collectionId}/connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const connection = (await res.json()) as Connection;
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, connections: [...c.connections, connection] }
              : c
          ),
        }));
      },

      renameConnection: async (collectionId, connId, name) => {
        await fetch(`/api/collections/${collectionId}/connections/${connId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  connections: c.connections.map((r) =>
                    r.id === connId ? { ...r, name, updatedAt: Date.now() } : r
                  ),
                }
              : c
          ),
        }));
      },

      updateConnectionConfig: async (collectionId, connId, connectionConfig) => {
        await fetch(`/api/collections/${collectionId}/connections/${connId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionConfig }),
        });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  connections: c.connections.map((r) =>
                    r.id === connId ? { ...r, connectionConfig, updatedAt: Date.now() } : r
                  ),
                }
              : c
          ),
        }));
      },

      deleteConnection: async (collectionId, connId) => {
        const wasConnected = get().connectedConnectionId === connId;
        await fetch(`/api/collections/${collectionId}/connections/${connId}`, { method: "DELETE" });
        if (wasConnected) {
          await get().disconnect();
        }
        set((s) => {
          const deletingSelected = s.selectedConnectionId === connId;
          const deletingConnected = s.connectedConnectionId === connId;
          const { [connId]: _removed, ...nextDrafts } = s.connectionDrafts;
          return {
            collections: s.collections.map((c) =>
              c.id === collectionId
                ? { ...c, connections: c.connections.filter((r) => r.id !== connId) }
                : c
            ),
            selectedConnectionId: deletingSelected ? null : s.selectedConnectionId,
            connectedConnectionId: deletingConnected ? null : s.connectedConnectionId,
            connectingConnectionId: deletingConnected ? null : s.connectingConnectionId,
            connectedConnectionCache: deletingConnected ? null : s.connectedConnectionCache,
            connectionDrafts: nextDrafts,
            ...(deletingSelected ? {
              ...blankWorkspacePatch(),
              transport: "stdio" as const,
              connectionUrl: "",
              stdio: DEFAULT_STDIO_DRAFT,
              httpAuth: DEFAULT_HTTP_AUTH,
              httpHeaders: DEFAULT_HTTP_HEADERS,
            } : {}),
          };
        });
      },

      // ---------- environments ----------
      loadEnvironments: async () => {
        const res = await fetch("/api/environments");
        const environments = (await res.json()) as Environment[];
        set({
          environments,
          activeEnvironmentId: environments.find((e) => e.isActive)?.id ?? null,
        });
      },

      createEnvironment: async (name) => {
        const res = await fetch("/api/environments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const env = (await res.json()) as Environment;
        set((s) => ({ environments: [...s.environments, env] }));
      },

      updateEnvironment: async (id, partial) => {
        await fetch(`/api/environments/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        set((s) => ({
          environments: s.environments.map((e) =>
            e.id === id ? { ...e, ...partial } : e
          ),
        }));
      },

      deleteEnvironment: async (id) => {
        await fetch(`/api/environments/${id}`, { method: "DELETE" });
        set((s) => ({ environments: s.environments.filter((e) => e.id !== id) }));
      },

      setActiveEnvironment: async (id) => {
        const envs = get().environments;
        for (const env of envs) {
          if (env.isActive !== (env.id === id)) {
            await fetch(`/api/environments/${env.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: env.id === id }),
            });
          }
        }
        set((s) => ({
          activeEnvironmentId: id,
          environments: s.environments.map((e) => ({ ...e, isActive: e.id === id })),
        }));
      },

      // ---------- configuration ----------
      setConfig: (partial) => set((s) => {
        const config = { ...s.config, ...partial };
        persistConfig(config);
        if (config.theme !== s.config.theme) applyTheme(config.theme);
        return { config };
      }),

      // ---------- connection form ----------
      setTransport: (t) =>
        set((s) => {
          const draft: ConnectionDraft = {
            transport: t,
            connectionUrl: s.connectionUrl,
            stdio: s.stdio,
            httpAuth: s.httpAuth,
            httpHeaders: s.httpHeaders,
          };
          persistConnectionDraft(draft);
          return {
            transport: t,
            ...buildConnectionDraftsPatch(s.selectedConnectionId, s.connectionDrafts, draft),
          };
        }),
      setStdio: (patch) =>
        set((s) => {
          const stdio = { ...s.stdio, ...patch };
          const draft: ConnectionDraft = {
            transport: s.transport,
            connectionUrl: s.connectionUrl,
            stdio,
            httpAuth: s.httpAuth,
            httpHeaders: s.httpHeaders,
          };
          persistConnectionDraft(draft);
          return {
            stdio,
            ...buildConnectionDraftsPatch(s.selectedConnectionId, s.connectionDrafts, draft),
          };
        }),
      setConnectionUrl: (url) =>
        set((s) => {
          const draft: ConnectionDraft = {
            transport: s.transport,
            connectionUrl: url,
            stdio: s.stdio,
            httpAuth: s.httpAuth,
            httpHeaders: s.httpHeaders,
          };
          persistConnectionDraft(draft);
          return {
            connectionUrl: url,
            ...buildConnectionDraftsPatch(s.selectedConnectionId, s.connectionDrafts, draft),
          };
        }),
      setHttpAuth: (auth) =>
        set((s) => {
          const draft: ConnectionDraft = {
            transport: s.transport,
            connectionUrl: s.connectionUrl,
            stdio: s.stdio,
            httpAuth: auth,
            httpHeaders: s.httpHeaders,
          };
          persistConnectionDraft(draft);
          return {
            httpAuth: auth,
            ...buildConnectionDraftsPatch(s.selectedConnectionId, s.connectionDrafts, draft),
          };
        }),
      setHttpHeaders: (headers) =>
        set((s) => {
          const draft: ConnectionDraft = {
            transport: s.transport,
            connectionUrl: s.connectionUrl,
            stdio: s.stdio,
            httpAuth: s.httpAuth,
            httpHeaders: headers,
          };
          persistConnectionDraft(draft);
          return {
            httpHeaders: headers,
            ...buildConnectionDraftsPatch(s.selectedConnectionId, s.connectionDrafts, draft),
          };
        }),

      // ---------- UI ----------
      toggleLogs: () => set((s) => ({ isLogsCollapsed: !s.isLogsCollapsed })),
      setLogsHeight: (height) =>
        set({ logsHeight: clampLogsHeight(height, Math.round(window.innerHeight * 0.7)) }),

    }),
    { name: "mcp-studio" }
  )
);

applyTheme(useStore.getState().config.theme);
const stopWatchingSystemTheme = watchSystemTheme(() => useStore.getState().config.theme);
import.meta.hot?.dispose(stopWatchingSystemTheme);

// ---------------------------------------------------------------------------
// Module-level server message handler
// ---------------------------------------------------------------------------

function handleServerMessage(msg: ServerMessage): void {
  const addLog = (level: LogEntry["level"], source: LogEntry["source"], message: string) => {
    useStore.setState((s) => {
      const nextLogIdCounter = s.logIdCounter + 1;
      const nextLog: LogEntry = {
        id: `log_${nextLogIdCounter}`,
        level,
        source,
        message,
        timestamp: Date.now(),
      };

      if (!s.connectedConnectionCache) {
        return { logIdCounter: nextLogIdCounter, logs: [...s.logs, nextLog].slice(-500) };
      }

      const nextLogs = [...s.connectedConnectionCache.logs, nextLog].slice(-500);
      const nextCache: ConnectedConnectionCache = {
        ...cloneConnectedCache(s.connectedConnectionCache),
        logs: nextLogs,
      };

      if (s.selectedConnectionId === s.connectedConnectionId) {
        return {
          logIdCounter: nextLogIdCounter,
          logs: nextLogs,
          connectedConnectionCache: nextCache,
        };
      }

      return {
        logIdCounter: nextLogIdCounter,
        connectedConnectionCache: nextCache,
      };
    });
  };

  switch (msg.type) {
    case "status":
      useStore.setState({ connectionStatus: msg.status });
      break;

    case "connected": {
      const state = useStore.getState();
      const connectionId = state.connectingConnectionId ?? state.selectedConnectionId;
      if (!connectionId) {
        useStore.setState({ connectionStatus: "connected", httpVariant: msg.httpVariant });
        return;
      }

      const nextCache: ConnectedConnectionCache = {
        connectionId,
        ...createBlankWorkspace(),
        tools: msg.tools,
        prompts: msg.prompts,
      };

      useStore.setState({
        connectionStatus: "connected",
        connectedConnectionId: connectionId,
        connectingConnectionId: null,
        connectedConnectionCache: nextCache,
        serverInfo: msg.serverInfo ?? null,
        protocolVersion: msg.protocolVersion ?? null,
        httpVariant: msg.httpVariant,
        connectedAt: Date.now(),
        requestCount: 0,
        errorCount: 0,
        latency: 0,
        ...(state.selectedConnectionId === connectionId ? connectionWorkspacePatch(nextCache) : blankWorkspacePatch()),
      });
      addLog("INFO", "protocol", `Connected — ${msg.tools.length} tools, ${msg.prompts.length} prompts`);
      break;
    }

    case "elicitation_request":
      useStore.setState(s => ({ elicitations: [...s.elicitations, msg] }));
      break;
    case "elicitation_closed":
      useStore.setState(s => ({ elicitations: s.elicitations.filter(r => r.elicitationId !== msg.elicitationId) }));
      break;
    case "disconnected":
      if (msg.reason) {
        toast.error("Session disconnected", { description: msg.reason });
        useStore.setState(s => ({ errorCount: s.errorCount + 1 }));
      }
      useStore.setState((s) => ({
        elicitations: [],
        connectionStatus: "disconnected",
        connectionConfig: null,
        serverInfo: null,
        protocolVersion: null,
        httpVariant: undefined,
        connectedConnectionId: null,
        connectingConnectionId: null,
        connectedConnectionCache: null,
        connectedAt: null,
        ...(s.selectedConnectionId === s.connectedConnectionId ? { tools: [], prompts: [], response: { ...s.response, isStreaming: false } } : {}),
      }));
      break;

    case "chunk":
      useStore.setState((s) => syncConnectedWorkspace(s, (workspace) => ({
        ...workspace,
        response: { ...workspace.response, chunks: [...workspace.response.chunks, msg.data] },
      })));
      break;

    case "result": {
      const completedAt = Date.now();
      useStore.setState((s) => {
        const startedAt = s.connectedConnectionCache?.response.startedAt;
        const elapsed = startedAt ? completedAt - startedAt : 0;
        return {
          latency: elapsed,
          errorCount: s.errorCount + (typeof msg.data === "object" && msg.data !== null && "isError" in msg.data && msg.data.isError === true ? 1 : 0),
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response: { ...workspace.response, result: msg.data, isStreaming: false, completedAt },
            timeline: [
              ...workspace.timeline.map((step) =>
                step.status === "active" ? { ...step, status: "completed" as const } : step
              ),
              {
                label: "Result received",
                detail: `Completed in ${elapsed}ms`,
                timestamp: fmtTime(completedAt),
                status: "completed" as const,
              },
            ],
          })),
        };
      });
      break;
    }

    case "prompt_result": {
      const completedAt = Date.now();
      useStore.setState((s) => {
        const startedAt = s.connectedConnectionCache?.response.startedAt;
        const elapsed = startedAt ? completedAt - startedAt : 0;
        return {
          latency: elapsed,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response: { ...workspace.response, result: msg.messages, isStreaming: false, completedAt },
            timeline: [
              ...workspace.timeline.map((step) =>
                step.status === "active" ? { ...step, status: "completed" as const } : step
              ),
              {
                label: "Result received",
                detail: `Completed in ${elapsed}ms`,
                timestamp: fmtTime(completedAt),
                status: "completed" as const,
              },
            ],
          })),
        };
      });
      break;
    }

    case "error":
      if (msg.code === "CONNECTION_FAILED") {
        useStore.setState({
          connectionStatus: "error",
          connectedConnectionId: null,
          connectingConnectionId: null,
          connectedConnectionCache: null,
          connectionConfig: null,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectedAt: null,
          ...blankWorkspacePatch(),
        });
        toast.error("Connection failed", { description: msg.message });
        useStore.setState(s => ({ errorCount: s.errorCount + 1 }));
      } else {
        const errorAt = Date.now();
        useStore.setState((s) => {
          const startedAt = s.connectedConnectionCache?.response.startedAt;
          const elapsed = startedAt ? errorAt - startedAt : 0;
          return {
            errorCount: s.errorCount + (s.connectionStatus === "disconnected" ? 0 : 1),
            ...(!s.connectedConnectionCache ? { response: { ...s.response, error: msg.message, isStreaming: false, completedAt: errorAt } } : {}),
            latency: elapsed,
            ...syncConnectedWorkspace(s, (workspace) => ({
              ...workspace,
              response: { ...workspace.response, error: msg.message, isStreaming: false, completedAt: errorAt },
              timeline: [
                ...workspace.timeline.map((step) =>
                  step.status === "active" ? { ...step, status: "completed" as const } : step
                ),
                {
                  label: "Error",
                  detail: msg.message,
                  timestamp: fmtTime(errorAt),
                  status: "completed" as const,
                },
              ],
            })),
          };
        });
      }
      break;

    case "log":
      addLog(msg.level, msg.source, msg.message);
      break;

    case "http_response":
      useStore.setState((s) => syncConnectedWorkspace(s, (workspace) => ({
        ...workspace,
        response: {
          ...workspace.response,
          httpStatus: msg.status,
          httpResponseHeaders: msg.headers,
        },
      })));
      break;

    case "tools_listed":
      useStore.setState((s) => syncConnectedWorkspace(s, (workspace) => ({
        ...workspace,
        tools: msg.tools,
      })));
      break;

    case "prompts_listed":
      useStore.setState((s) => syncConnectedWorkspace(s, (workspace) => ({
        ...workspace,
        prompts: msg.prompts,
      })));
      break;
  }
}
