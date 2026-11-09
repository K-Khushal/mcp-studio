import { toast } from "sonner";
import type { ElicitationResult } from "@mcp-studio/types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  CallProgress,
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
  LogLevel,
  LogSource,
  LogPayload,
} from "@mcp-studio/types";
import { prepareLog, retainLogs } from "@/components/logs/filter-logs";
import { transport } from "@/transport/websocket-transport";
import { applyTheme, watchSystemTheme } from "@/lib/theme";
import { persistConfig, readPersistedConfig } from "./config";
import {
  DEFAULT_STDIO_DRAFT,
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

export interface LogEntry {
  id: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  timestamp: number;
  payload?: LogPayload;
  searchText?: string;
}

interface ResponseState {
  outputSchema?: Record<string, unknown>;
  requestId: string | null;
  progress: CallProgress | null;
  outcome: "result" | "error" | "cancelled" | "timeout" | null;
  result: unknown | null;
  error: string | null;
  isRunning: boolean;
  startedAt: number | null;
  completedAt: number | null;
  httpStatus: number | null;
  httpResponseHeaders: Record<string, string> | null;
}

interface TimelineStep {
  scope?: "session" | "call";
  durationMs?: number;
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
  lastConnectionError: { connectionId: string; message: string } | null;
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

  // OAuth sign-in the Studio Server is waiting on, while connecting
  oauthAuthorizationUrl: string | null;

  // UI
  isLogsCollapsed: boolean;
  logsHeight: number;

}

interface AppActions {
  respondToElicitation: (elicitationId: string, result: ElicitationResult) => void;
  // Connection
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Forget a Connection's OAuth sign-in; ends its Session if live. */
  signOut: (collectionId: string, connId: string) => Promise<boolean>;

  // Tools
  selectTool: (tool: MCPTool | null) => void;
  setToolSearch: (q: string) => void;
  setToolFormValues: (values: Record<string, unknown>) => void;
  setPromptSearch: (q: string) => void;
  setPromptArgValues: (values: Record<string, string>) => void;

  // Prompts
  selectPrompt: (prompt: MCPPrompt | null) => void;

  // Invocation
  cancelCall: () => void;
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
  requestId: null,
  progress: null,
  outcome: null,
  result: null,
  error: null,
  isRunning: false,
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
      outputSchema: workspace.response.outputSchema,
      requestId: workspace.response.requestId,
      progress: workspace.response.progress,
      outcome: workspace.response.outcome,
      result: workspace.response.result,
      error: workspace.response.error,
      isRunning: workspace.response.isRunning,
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
  // Older versions stored complete credentials here. Discard them rather than
  // hydrating them into another app sharing this browser origin.
  try { localStorage.removeItem("mcp-studio-connection"); } catch { /* Storage may be disabled. */ }
  return { ...DEFAULT_CONNECTION_DRAFT };
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
      oauthAuthorizationUrl: null,
      isLogsCollapsed: true,
      logsHeight: LOGS_DEFAULT_HEIGHT,

      lastConnectionError: null,

      // ---------- connection ----------
      connect: async (config) => {
        const selectedConnectionId = get().selectedConnectionId;
        if (!selectedConnectionId) return;

        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          lastConnectionError: null,
          connectedConnectionId: null,
          connectingConnectionId: selectedConnectionId,
          connectedConnectionCache: null,
          connectionConfig: config,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectionStatus: "connecting",
          oauthAuthorizationUrl: null,
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
        handshakeLogs = [];
        handshakeTimeline = [];
        transport.onMessage(handleServerMessage);
        try {
          await transport.connect(config, get().config.verboseLogging, selectedConnectionId ?? undefined);
        } catch (err) {
          handleServerMessage({ type: "error", code: "CONNECTION_FAILED", message: err instanceof Error ? err.message : String(err) });
        }
      },

      disconnect: async () => {
        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          lastConnectionError: null,
          elicitations: [],
            connectionStatus: "disconnected",
          connectionConfig: null,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectedConnectionId: null,
          connectingConnectionId: null,
          connectedConnectionCache: null,
          oauthAuthorizationUrl: null,
          requestCount: 0,
          errorCount: 0,
          latency: 0,
          connectedAt: null,
        });

        if (transport.isConnected) {
          await transport.disconnect();
        }
      },

      signOut: async (collectionId, connId) => {
        const { connectedConnectionId, connectingConnectionId } = get();
        if (connectedConnectionId === connId || connectingConnectionId === connId) {
          await get().disconnect();
        }
        try {
          const response = await fetch(`/api/collections/${collectionId}/connections/${connId}/oauth`, { method: "DELETE" });
          if (!response.ok) throw new Error("Sign-out failed");
          return true;
        } catch {
          toast.error("Failed to sign out");
          return false;
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
      cancelCall: () => {
        const response = get().connectedConnectionCache?.response;
        if (response?.isRunning && response.requestId) transport.send({ type: "cancel", requestId: response.requestId });
      },
      invokeTool: async (tool, params) => {
        const state = get();
        if (state.response.isRunning) return;
        if (state.connectionStatus !== "connected" || state.selectedConnectionId !== state.connectedConnectionId) {
          toast.error("Not connected", { description: "Connect the selected Connection first." });
          return;
        }

        const now = Date.now();
        const response: ResponseState = {
          outputSchema: state.tools.find(t => t.name === tool)?.outputSchema,
          requestId: crypto.randomUUID(),
          progress: null,
          outcome: null,
          result: null,
          error: null,
          isRunning: true,
          startedAt: now,
          completedAt: null,
          httpStatus: null,
          httpResponseHeaders: null,
        };
        const timeline: TimelineStep[] = [
          ...state.timeline.filter(step => step.scope === "session"),
          { scope: "call", label: "Call sent", detail: `Tool: ${tool}`, timestamp: fmtTime(now), durationMs: 0, status: "completed" },
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
        await transport.invoke(tool, params, response.requestId!, state.config.requestTimeout);
      },

      invokePrompt: async (prompt, args) => {
        const state = get();
        if (state.response.isRunning) return;
        if (state.connectionStatus !== "connected" || state.selectedConnectionId !== state.connectedConnectionId) {
          toast.error("Not connected", { description: "Connect the selected Connection first." });
          return;
        }

        const now = Date.now();
        const response: ResponseState = {
          requestId: crypto.randomUUID(),
          progress: null,
          outcome: null,
          result: null,
          error: null,
          isRunning: true,
          startedAt: now,
          completedAt: null,
          httpStatus: null,
          httpResponseHeaders: null,
        };
        const timeline: TimelineStep[] = [
          ...state.timeline.filter(step => step.scope === "session"),
          { scope: "call", label: "Call sent", detail: `Prompt: ${prompt}`, timestamp: fmtTime(now), durationMs: 0, status: "completed" },
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
        await transport.invokePrompt(prompt, args, response.requestId!, state.config.requestTimeout);
      },

      // ---------- Connection loading ----------
      loadConnection: (connection) => {
        if (get().selectedConnectionId === connection.id) return;

        const state = get();
        const draft =
          state.connectionDrafts[connection.id] ??
          connectionDraftFromConfig(connection.connectionConfig) ??
          { ...DEFAULT_CONNECTION_DRAFT };

        set({
          ...blankWorkspacePatch(),
          selectedConnectionId: connection.id,
          lastConnectionError: null,
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
      setConfig: (partial) => {
        const previous = get().config;
        const config = { ...previous, ...partial };
        persistConfig(config);
        if (config.theme !== previous.theme) applyTheme(config.theme);
        if (config.verboseLogging !== previous.verboseLogging && transport.isConnected) {
          transport.setVerbose(config.verboseLogging);
        }
        set({ config });
      },

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

/** Logs that arrive while connecting, before the connected cache exists; adopted when the Session connects. */
let handshakeLogs: LogEntry[] = [];
let handshakeTimeline: TimelineStep[] = [];

function handleServerMessage(msg: ServerMessage): void {
  const addLog = (level: LogLevel, source: LogSource, message: string, payload?: LogPayload, timestamp = Date.now()) => {
    useStore.setState((s) => {
      const nextLogIdCounter = s.logIdCounter + 1;
      const nextLog: LogEntry = {
        id: `log_${nextLogIdCounter}`,
        level,
        source,
        timestamp,
        ...prepareLog(message, payload),
      };

      if (!s.connectedConnectionCache) {
        if (s.connectionStatus === "connecting") handshakeLogs = retainLogs([...handshakeLogs, nextLog]);
        return { logIdCounter: nextLogIdCounter, logs: retainLogs([...s.logs, nextLog]) };
      }

      const nextLogs = retainLogs([...s.connectedConnectionCache.logs, nextLog]);
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

  const matchesCall = (requestId: string) => {
    const state = useStore.getState();
    const response = state.connectedConnectionCache?.response ?? state.response;
    return response.requestId === requestId;
  };

  switch (msg.type) {
    case "status":
      useStore.setState({ connectionStatus: msg.status });
      break;

    case "connected": {
      const state = useStore.getState();
      const connectionId = state.connectingConnectionId ?? state.selectedConnectionId;
      if (!connectionId) {
        useStore.setState({ connectionStatus: "connected", httpVariant: msg.httpVariant, oauthAuthorizationUrl: null });
        return;
      }

      const nextCache: ConnectedConnectionCache = {
        connectionId,
        ...createBlankWorkspace(),
        logs: handshakeLogs,
        timeline: handshakeTimeline,
        tools: msg.tools,
        prompts: msg.prompts,
      };
      handshakeLogs = [];
      handshakeTimeline = [];

      useStore.setState({
        connectionStatus: "connected",
        oauthAuthorizationUrl: null,
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
      addLog("INFO", "studio", `Connected — ${msg.tools.length} tools, ${msg.prompts.length} prompts`);
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
        oauthAuthorizationUrl: null,
        connectionConfig: null,
        serverInfo: null,
        protocolVersion: null,
        httpVariant: undefined,
        connectedConnectionId: null,
        connectingConnectionId: null,
        connectedConnectionCache: null,
        connectedAt: null,
        ...(s.selectedConnectionId === s.connectedConnectionId ? { tools: [], prompts: [], response: { ...s.response, isRunning: false, ...(s.response.isRunning ? { outcome: msg.reason ? "error" as const : "cancelled" as const, error: msg.reason ?? null, completedAt: Date.now() } : {}) } } : {}),
      }));
      break;

    case "session_phase": {
      const step: TimelineStep = { scope: "session", label: `Session: ${msg.phase}`, detail: msg.phase === "initialize" ? "MCP initialize handshake" : msg.phase === "spawn" ? "Start MCP Server process" : "Open HTTP transport", timestamp: fmtTime(msg.timestamp), durationMs: msg.durationMs, status: "completed" };
      handshakeTimeline.push(step);
      useStore.setState(s => ({ timeline: [...s.timeline, step] }));
      break;
    }

    case "progress":
      useStore.setState(s => syncConnectedWorkspace(s, workspace => {
        if (workspace.response.requestId !== msg.requestId || !workspace.response.isRunning) return workspace;
        const { progress, total, message } = msg;
        const elapsed = Date.now() - (workspace.response.startedAt ?? Date.now());
        return {
          ...workspace,
          response: { ...workspace.response, progress: { progress, ...(total !== undefined ? { total } : {}), ...(message !== undefined ? { message } : {}) } },
          timeline: [...workspace.timeline.filter(step => step.label !== "Progress"), ...workspace.timeline.filter(step => step.label === "Progress").slice(-49), { scope: "call", label: "Progress", detail: `${progress}${total !== undefined ? ` / ${total}` : ""}${message ? ` — ${message}` : ""}`, timestamp: fmtTime(Date.now()), durationMs: elapsed, status: "completed" }],
        };
      }));
      break;

    case "cancelled": {
      const completedAt = Date.now();
      useStore.setState(s => syncConnectedWorkspace(s, workspace => {
        if (workspace.response.requestId !== msg.requestId || !workspace.response.isRunning) return workspace;
        return {
          ...workspace,
          response: { ...workspace.response, isRunning: false, outcome: "cancelled", completedAt },
          timeline: [...workspace.timeline, { scope: "call", label: "Cancelled", detail: "Call cancelled", timestamp: fmtTime(completedAt), durationMs: completedAt - (workspace.response.startedAt ?? completedAt), status: "completed" }],
        };
      }));
      break;
    }

    case "result": {
      if (!matchesCall(msg.requestId) || !useStore.getState().connectedConnectionCache?.response.isRunning) break;
      const isToolError = typeof msg.data === "object" && msg.data !== null && "isError" in msg.data && msg.data.isError === true;
      const completedAt = Date.now();
      useStore.setState((s) => {
        const startedAt = s.connectedConnectionCache?.response.startedAt;
        const elapsed = startedAt ? completedAt - startedAt : 0;
        return {
          latency: elapsed,
          errorCount: s.errorCount + (isToolError ? 1 : 0),
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response: { ...workspace.response, result: msg.data, outcome: isToolError ? "error" : "result", isRunning: false, completedAt },
            timeline: [
              ...workspace.timeline.map((step) =>
                step.status === "active" ? { ...step, status: "completed" as const } : step
              ),
              {
                scope: "call",
                durationMs: elapsed,
                label: isToolError ? "Error" : "Result received",
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
      if (!matchesCall(msg.requestId) || !useStore.getState().connectedConnectionCache?.response.isRunning) break;
      const completedAt = Date.now();
      useStore.setState((s) => {
        const startedAt = s.connectedConnectionCache?.response.startedAt;
        const elapsed = startedAt ? completedAt - startedAt : 0;
        return {
          latency: elapsed,
          ...syncConnectedWorkspace(s, (workspace) => ({
            ...workspace,
            response: { ...workspace.response, result: msg.messages, outcome: "result", isRunning: false, completedAt },
            timeline: [
              ...workspace.timeline.map((step) =>
                step.status === "active" ? { ...step, status: "completed" as const } : step
              ),
              {
                scope: "call",
                durationMs: elapsed,
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
        const state = useStore.getState();
        const connectionId = state.connectingConnectionId ?? state.selectedConnectionId;
        // The Studio Server normally sends this log first. Browser transport failures do not.
        if (!state.logs.some(log => log.source === "studio" && log.level === "ERROR" && log.message === msg.message)) {
          addLog("ERROR", "studio", msg.message);
        }
        const failureLogs = useStore.getState().logs;
        handshakeLogs = [];
        handshakeTimeline = [];
        useStore.setState({
          connectionStatus: "error",
          oauthAuthorizationUrl: null,
          connectedConnectionId: null,
          connectingConnectionId: null,
          connectedConnectionCache: null,
          connectionConfig: null,
          serverInfo: null,
          protocolVersion: null,
          httpVariant: undefined,
          connectedAt: null,
          ...blankWorkspacePatch(),
          logs: failureLogs,
          lastConnectionError: connectionId ? { connectionId, message: msg.message } : null,
        });
        toast.error("Connection failed", { id: "connection-failed", description: msg.message, duration: Infinity });
        useStore.setState(s => ({ errorCount: s.errorCount + 1 }));
      } else {
        if (msg.requestId && (!matchesCall(msg.requestId) || !useStore.getState().connectedConnectionCache?.response.isRunning)) break;
        const errorAt = Date.now();
        useStore.setState((s) => {
          const startedAt = s.connectedConnectionCache?.response.startedAt;
          const elapsed = startedAt ? errorAt - startedAt : 0;
          return {
            errorCount: s.errorCount + (s.connectionStatus === "disconnected" ? 0 : 1),
            ...(!s.connectedConnectionCache ? { response: { ...s.response, error: msg.message, outcome: msg.code === "CALL_TIMEOUT" ? "timeout" : "error", isRunning: false, completedAt: errorAt } } : {}),
            latency: elapsed,
            ...syncConnectedWorkspace(s, (workspace) => ({
              ...workspace,
              response: { ...workspace.response, error: msg.message, outcome: msg.code === "CALL_TIMEOUT" ? "timeout" : "error", isRunning: false, completedAt: errorAt },
              timeline: [
                ...workspace.timeline.map((step) =>
                  step.status === "active" ? { ...step, status: "completed" as const } : step
                ),
                {
                  scope: "call",
                  durationMs: elapsed,
                  label: msg.code === "CALL_TIMEOUT" ? "Timeout" : "Error",
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
      addLog(msg.level, msg.source, msg.message, msg.payload, msg.timestamp);
      break;

    case "http_response":
      if (!matchesCall(msg.requestId) || !useStore.getState().connectedConnectionCache?.response.isRunning) break;
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

    case "oauth_authorize":
      // Not a user gesture, so popup blockers may stop this; the connection panel keeps the link.
      window.open(msg.url, "_blank", "noopener");
      useStore.setState({ oauthAuthorizationUrl: msg.url });
      addLog("INFO", "protocol", "OAuth sign-in opened in the browser");
      break;

    case "prompts_listed":
      useStore.setState((s) => syncConnectedWorkspace(s, (workspace) => ({
        ...workspace,
        prompts: msg.prompts,
      })));
      break;
  }
}
