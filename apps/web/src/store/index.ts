import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  MCPTool,
  MCPPrompt,
  MCPConfig,
  ConnectionStatus,
  Collection,
  SavedRequest,
  Environment,
  ServerMessage,
  ConnectionConfig,
} from "@mcp-studio/types";
import { transport } from "@/transport/websocket-transport";

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
}

interface RequestWorkspaceState {
  tools: MCPTool[];
  prompts: MCPPrompt[];
  selectedTool: MCPTool | null;
  selectedPrompt: MCPPrompt | null;
  toolSearch: string;
  promptSearch: string;
  pendingParams: Record<string, unknown> | null;
  toolFormValues: Record<string, string>;
  promptArgValues: Record<string, string>;
  response: ResponseState;
  timeline: TimelineStep[];
  logs: LogEntry[];
}

interface ConnectedRequestCache extends RequestWorkspaceState {
  requestId: string;
}

interface AppState {
  // Connection
  connectionStatus: ConnectionStatus;
  connectionConfig: ConnectionConfig | null;
  serverInfo: unknown;
  connectedRequestId: string | null;
  connectingRequestId: string | null;
  connectedRequestCache: ConnectedRequestCache | null;

  // Tools & Prompts
  tools: MCPTool[];
  prompts: MCPPrompt[];
  selectedTool: MCPTool | null;
  selectedPrompt: MCPPrompt | null;
  toolSearch: string;
  promptSearch: string;
  pendingParams: Record<string, unknown> | null;
  toolFormValues: Record<string, string>;
  promptArgValues: Record<string, string>;

  // Response
  response: ResponseState;
  timeline: TimelineStep[];

  // Logs
  logs: LogEntry[];
  logIdCounter: number;

  // Collections
  collections: Collection[];
  selectedRequestId: string | null;
  requestDrafts: Record<string, ConnectionDraft>;

  // Connection form (persisted in store so panels stay in sync)
  transport: "stdio" | "http";
  connectionUrl: string;

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
  activeView: "studio" | "collections" | "logs" | "settings";
  isLogsCollapsed: boolean;
  isDarkMode: boolean;

  toasts: Array<{ id: string; title: string; description?: string; variant?: "destructive" }>;
}

interface AppActions {
  // Connection
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;

  // Tools
  selectTool: (tool: MCPTool | null) => void;
  setToolSearch: (q: string) => void;
  setToolFormValues: (values: Record<string, string>) => void;
  setPromptSearch: (q: string) => void;
  setPromptArgValues: (values: Record<string, string>) => void;

  // Prompts
  selectPrompt: (prompt: MCPPrompt | null) => void;

  // Invocation
  invokeTool: (tool: string, params: Record<string, unknown>) => Promise<void>;
  invokePrompt: (prompt: string, args: Record<string, string>) => Promise<void>;

  // Load saved request into invoke panel
  loadSavedRequest: (request: SavedRequest) => void;
  clearPendingParams: () => void;

  // Logs
  clearLogs: () => void;

  // Collections
  loadCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addRequest: (collectionId: string, data: Omit<SavedRequest, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  renameRequest: (collectionId: string, reqId: string, name: string) => Promise<void>;
  updateRequestConnection: (collectionId: string, reqId: string, connectionConfig: ConnectionConfig) => Promise<void>;
  deleteRequest: (collectionId: string, reqId: string) => Promise<void>;

  // Connection form
  setTransport: (t: "stdio" | "http") => void;
  setConnectionUrl: (url: string) => void;

  // Environments
  loadEnvironments: () => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  updateEnvironment: (id: string, partial: Partial<Pick<Environment, "name" | "variables" | "isActive">>) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id: string) => Promise<void>;

  // Configuration
  setConfig: (partial: Partial<MCPConfig>) => void;

  // UI
  setActiveView: (view: AppState["activeView"]) => void;
  toggleLogs: () => void;
  toggleDarkMode: () => void;
  addToast: (t: Omit<AppState["toasts"][number], "id">) => void;
  removeToast: (id: string) => void;
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
} as const;

const DEFAULT_CONNECTION_DRAFT: ConnectionDraft = {
  transport: "stdio",
  connectionUrl: "",
};

function createBlankWorkspace(): RequestWorkspaceState {
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

function cloneWorkspace(workspace: RequestWorkspaceState): RequestWorkspaceState {
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
    },
    timeline: [...workspace.timeline],
    logs: [...workspace.logs],
  };
}

function cloneConnectedCache(cache: ConnectedRequestCache): ConnectedRequestCache {
  return {
    requestId: cache.requestId,
    ...cloneWorkspace(cache),
  };
}

function connectionDraftFromConfig(config?: ConnectionConfig | null): ConnectionDraft | null {
  if (!config) return null;
  if (config.transport === "http") {
    return {
      transport: "http",
      connectionUrl: config.config.url,
    };
  }

  return {
    transport: "stdio",
    connectionUrl: [config.config.command, ...config.config.args].join(" ").trim(),
  };
}

function readPersistedConnectionDraft(): ConnectionDraft {
  try {
    const raw = localStorage.getItem("mcp-studio-connection");
    if (!raw) return { ...DEFAULT_CONNECTION_DRAFT };
    const parsed = JSON.parse(raw) as Partial<ConnectionDraft>;
    return {
      transport: parsed.transport === "http" ? "http" : "stdio",
      connectionUrl: parsed.connectionUrl ?? "",
    };
  } catch {
    return { ...DEFAULT_CONNECTION_DRAFT };
  }
}

function persistConnectionDraft(draft: ConnectionDraft): void {
  try {
    localStorage.setItem("mcp-studio-connection", JSON.stringify(draft));
  } catch {}
}

function requestWorkspacePatch(workspace: RequestWorkspaceState): Pick<
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
  return requestWorkspacePatch(createBlankWorkspace());
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
  updater: (workspace: RequestWorkspaceState) => RequestWorkspaceState
): Partial<AppState> {
  if (!state.connectedRequestCache) return {};

  const nextWorkspace = updater(cloneWorkspace(state.connectedRequestCache));
  const nextCache: ConnectedRequestCache = {
    requestId: state.connectedRequestCache.requestId,
    ...cloneWorkspace(nextWorkspace),
  };

  if (state.selectedRequestId === state.connectedRequestId) {
    return {
      connectedRequestCache: nextCache,
      ...requestWorkspacePatch(nextWorkspace),
    };
  }

  return { connectedRequestCache: nextCache };
}

function buildRequestDraftsPatch(
  selectedRequestId: string | null,
  drafts: Record<string, ConnectionDraft>,
  draft: ConnectionDraft
): { requestDrafts?: Record<string, ConnectionDraft> } {
  if (!selectedRequestId) return {};
  return {
    requestDrafts: {
      ...drafts,
      [selectedRequestId]: { ...draft },
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
      connectionStatus: "disconnected",
      connectionConfig: null,
      serverInfo: null,
      connectedRequestId: null,
      connectingRequestId: null,
      connectedRequestCache: null,
      ...blankWorkspacePatch(),
      logIdCounter: 0,
      collections: [],
      selectedRequestId: null,
      requestDrafts: {},
      transport: readPersistedConnectionDraft().transport,
      connectionUrl: readPersistedConnectionDraft().connectionUrl,
      environments: [],
      config: (() => {
        const defaults: MCPConfig = {
          requestTimeout: 30,
          autoScrollLogs: true,
          streamResponses: true,
          verboseLogging: false,
          showReasoning: true,
          showTimeline: true,
        };
        try {
          const raw = localStorage.getItem("mcp-studio-config");
          return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<MCPConfig>) } : defaults;
        } catch {
          return defaults;
        }
      })(),
      activeEnvironmentId: null,
      latency: 0,
      requestCount: 0,
      errorCount: 0,
      connectedAt: null,
      activeView: "studio",
      isLogsCollapsed: false,
      isDarkMode: true,
      toasts: [],

      // ---------- connection ----------
      connect: async (config) => {
        const selectedRequestId = get().selectedRequestId;
        if (!selectedRequestId) return;

        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          connectedRequestId: null,
          connectingRequestId: selectedRequestId,
          connectedRequestCache: null,
          connectionConfig: config,
          serverInfo: null,
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
          connectingRequestId: selectedRequestId,
        });
        transport.onMessage(handleServerMessage);
        await transport.connect(config);
      },

      disconnect: async () => {
        const clearedWorkspace = blankWorkspacePatch();
        set({
          ...clearedWorkspace,
          connectionStatus: "disconnected",
          connectionConfig: null,
          serverInfo: null,
          connectedRequestId: null,
          connectingRequestId: null,
          connectedRequestCache: null,
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
        if (state.connectionStatus !== "connected" || state.selectedRequestId !== state.connectedRequestId) {
          state.addToast({ title: "Not connected", description: "Connect the selected request first.", variant: "destructive" });
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
        if (state.connectionStatus !== "connected" || state.selectedRequestId !== state.connectedRequestId) {
          state.addToast({ title: "Not connected", description: "Connect the selected request first.", variant: "destructive" });
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

      // ---------- saved request loading ----------
      loadSavedRequest: (request) => {
        if (get().selectedRequestId === request.id) {
          set({ activeView: "studio" });
          return;
        }

        const state = get();
        const draft =
          state.requestDrafts[request.id] ??
          connectionDraftFromConfig(request.connectionConfig) ??
          { ...DEFAULT_CONNECTION_DRAFT };

        persistConnectionDraft(draft);

        const workspace =
          state.connectedRequestId === request.id && state.connectedRequestCache
            ? requestWorkspacePatch(state.connectedRequestCache)
            : blankWorkspacePatch();

        set({
          ...workspace,
          activeView: "studio",
          selectedRequestId: request.id,
          transport: draft.transport,
          connectionUrl: draft.connectionUrl,
          requestDrafts: {
            ...state.requestDrafts,
            [request.id]: draft,
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
          const deletedReqIds = new Set(
            state.collections.find((c) => c.id === id)?.requests.map((r) => r.id) ?? []
          );
          return deletedReqIds.has(state.connectedRequestId ?? "");
        })();
        await fetch(`/api/collections/${id}`, { method: "DELETE" });
        if (wasConnected) {
          await get().disconnect();
        }
        set((s) => {
          const deletedReqIds = new Set(
            s.collections.find((c) => c.id === id)?.requests.map((r) => r.id) ?? []
          );
          const selectedRequestDeleted = deletedReqIds.has(s.selectedRequestId ?? "");
          const connectedRequestDeleted = deletedReqIds.has(s.connectedRequestId ?? "");
          return {
            collections: s.collections.filter((c) => c.id !== id),
            selectedRequestId: selectedRequestDeleted ? null : s.selectedRequestId,
            connectedRequestId: connectedRequestDeleted ? null : s.connectedRequestId,
            connectingRequestId: connectedRequestDeleted ? null : s.connectingRequestId,
            connectedRequestCache: connectedRequestDeleted ? null : s.connectedRequestCache,
            ...(selectedRequestDeleted ? blankWorkspacePatch() : {}),
          };
        });
      },

      addRequest: async (collectionId, data) => {
        const res = await fetch(`/api/collections/${collectionId}/requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const request = (await res.json()) as SavedRequest;
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: [...c.requests, request] }
              : c
          ),
        }));
      },

      renameRequest: async (collectionId, reqId, name) => {
        await fetch(`/api/collections/${collectionId}/requests/${reqId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  requests: c.requests.map((r) =>
                    r.id === reqId ? { ...r, name, updatedAt: Date.now() } : r
                  ),
                }
              : c
          ),
        }));
      },

      updateRequestConnection: async (collectionId, reqId, connectionConfig) => {
        await fetch(`/api/collections/${collectionId}/requests/${reqId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionConfig }),
        });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  requests: c.requests.map((r) =>
                    r.id === reqId ? { ...r, connectionConfig, updatedAt: Date.now() } : r
                  ),
                }
              : c
          ),
        }));
      },

      deleteRequest: async (collectionId, reqId) => {
        const wasConnected = get().connectedRequestId === reqId;
        await fetch(`/api/collections/${collectionId}/requests/${reqId}`, { method: "DELETE" });
        if (wasConnected) {
          await get().disconnect();
        }
        set((s) => {
          const deletingSelected = s.selectedRequestId === reqId;
          const deletingConnected = s.connectedRequestId === reqId;
          return {
            collections: s.collections.map((c) =>
              c.id === collectionId
                ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) }
                : c
            ),
            selectedRequestId: deletingSelected ? null : s.selectedRequestId,
            connectedRequestId: deletingConnected ? null : s.connectedRequestId,
            connectingRequestId: deletingConnected ? null : s.connectingRequestId,
            connectedRequestCache: deletingConnected ? null : s.connectedRequestCache,
            ...(deletingSelected ? blankWorkspacePatch() : {}),
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
        try { localStorage.setItem("mcp-studio-config", JSON.stringify(config)); } catch {}
        return { config };
      }),

      // ---------- connection form ----------
      setTransport: (t) =>
        set((s) => {
          const draft = { transport: t, connectionUrl: s.connectionUrl };
          persistConnectionDraft(draft);
          return {
            transport: t,
            ...buildRequestDraftsPatch(s.selectedRequestId, s.requestDrafts, draft),
          };
        }),
      setConnectionUrl: (url) =>
        set((s) => {
          const draft = { transport: s.transport, connectionUrl: url };
          persistConnectionDraft(draft);
          return {
            connectionUrl: url,
            ...buildRequestDraftsPatch(s.selectedRequestId, s.requestDrafts, draft),
          };
        }),

      // ---------- UI ----------
      setActiveView: (view) => set({ activeView: view }),
      toggleLogs: () => set((s) => ({ isLogsCollapsed: !s.isLogsCollapsed })),
      toggleDarkMode: () =>
        set((s) => {
          const next = !s.isDarkMode;
          document.documentElement.classList.toggle("dark", next);
          return { isDarkMode: next };
        }),
      addToast: (t) =>
        set((s) => ({
          toasts: [...s.toasts, { ...t, id: `toast_${Date.now()}` }],
        })),
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    { name: "mcp-studio" }
  )
);

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

      if (!s.connectedRequestCache) {
        return { logIdCounter: nextLogIdCounter };
      }

      const nextLogs = [...s.connectedRequestCache.logs, nextLog].slice(-500);
      const nextCache: ConnectedRequestCache = {
        ...cloneConnectedCache(s.connectedRequestCache),
        logs: nextLogs,
      };

      if (s.selectedRequestId === s.connectedRequestId) {
        return {
          logIdCounter: nextLogIdCounter,
          logs: nextLogs,
          connectedRequestCache: nextCache,
        };
      }

      return {
        logIdCounter: nextLogIdCounter,
        connectedRequestCache: nextCache,
      };
    });
  };

  switch (msg.type) {
    case "status":
      useStore.setState({ connectionStatus: msg.status });
      break;

    case "connected": {
      const state = useStore.getState();
      const requestId = state.connectingRequestId ?? state.selectedRequestId;
      if (!requestId) {
        useStore.setState({ connectionStatus: "connected" });
        return;
      }

      const nextCache: ConnectedRequestCache = {
        requestId,
        ...createBlankWorkspace(),
        tools: msg.tools,
        prompts: msg.prompts,
      };

      useStore.setState({
        connectionStatus: "connected",
        connectedRequestId: requestId,
        connectingRequestId: null,
        connectedRequestCache: nextCache,
        serverInfo: msg.serverInfo,
        connectedAt: Date.now(),
        requestCount: 0,
        errorCount: 0,
        latency: 0,
        ...(state.selectedRequestId === requestId ? requestWorkspacePatch(nextCache) : blankWorkspacePatch()),
      });
      addLog("INFO", "protocol", `Connected — ${msg.tools.length} tools, ${msg.prompts.length} prompts`);
      break;
    }

    case "disconnected":
      useStore.setState((s) => ({
        connectionStatus: "disconnected",
        connectionConfig: null,
        serverInfo: null,
        connectedRequestId: null,
        connectingRequestId: null,
        connectedRequestCache: null,
        connectedAt: null,
        ...(s.selectedRequestId === s.connectedRequestId ? blankWorkspacePatch() : {}),
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
        const startedAt = s.connectedRequestCache?.response.startedAt;
        const elapsed = startedAt ? completedAt - startedAt : 0;
        return {
          latency: elapsed,
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
        const startedAt = s.connectedRequestCache?.response.startedAt;
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

    case "ERROR":
      if (msg.code === "CONNECTION_FAILED") {
        useStore.setState({
          connectionStatus: "error",
          connectedRequestId: null,
          connectingRequestId: null,
          connectedRequestCache: null,
          connectionConfig: null,
          serverInfo: null,
          connectedAt: null,
          ...blankWorkspacePatch(),
        });
        useStore.getState().addToast({ title: "Connection failed", description: msg.message, variant: "destructive" });
      } else {
        const errorAt = Date.now();
        useStore.setState((s) => {
          const startedAt = s.connectedRequestCache?.response.startedAt;
          const elapsed = startedAt ? errorAt - startedAt : 0;
          return {
            errorCount: s.errorCount + 1,
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
      addLog("ERROR", "protocol", msg.message);
      break;

    case "log":
      addLog(msg.level, msg.source, msg.message);
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
