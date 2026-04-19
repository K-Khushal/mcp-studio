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
  level: "debug" | "info" | "warn" | "error";
  source: "protocol" | "subprocess";
  text: string;
  timestamp: number;
}

interface ResponseState {
  requestId: string | null;
  chunks: unknown[];
  result: unknown | null;
  error: string | null;
  isStreaming: boolean;
  startedAt: number | null;
  completedAt: number | null;
}

interface AppState {
  // Connection
  connectionStatus: ConnectionStatus;
  connectionConfig: ConnectionConfig | null;
  serverInfo: unknown;

  // Tools & Prompts
  tools: MCPTool[];
  prompts: MCPPrompt[];
  selectedTool: MCPTool | null;
  selectedPrompt: MCPPrompt | null;
  toolSearch: string;
  pendingParams: Record<string, unknown> | null;

  // Response
  response: ResponseState;

  // Logs
  logs: LogEntry[];
  logIdCounter: number;

  // Collections
  collections: Collection[];
  selectedRequestId: string | null;

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
      tools: [],
      prompts: [],
      selectedTool: null,
      selectedPrompt: null,
      toolSearch: "",
      pendingParams: null,
      response: {
        requestId: null,
        chunks: [],
        result: null,
        error: null,
        isStreaming: false,
        startedAt: null,
        completedAt: null,
      },
      logs: [],
      logIdCounter: 0,
      collections: [],
      selectedRequestId: null,
      transport: "stdio",
      connectionUrl: "",
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
      activeView: "studio",
      isLogsCollapsed: false,
      isDarkMode: true,
      toasts: [],

      // ---------- connection ----------
      connect: async (config) => {
        set({ connectionStatus: "connecting", connectionConfig: config });
        transport.onMessage(handleServerMessage);
        await transport.connect(config);
      },

      disconnect: async () => {
        await transport.disconnect();
      },

      // ---------- tools ----------
      selectTool: (tool) => set({ selectedTool: tool, selectedPrompt: null, pendingParams: null }),
      setToolSearch: (q) => set({ toolSearch: q }),

      // ---------- prompts ----------
      selectPrompt: (prompt) => set({ selectedPrompt: prompt, selectedTool: null, pendingParams: null }),

      // ---------- invocation ----------
      invokeTool: async (tool, params) => {
        set({
          response: {
            requestId: null,
            chunks: [],
            result: null,
            error: null,
            isStreaming: true,
            startedAt: Date.now(),
            completedAt: null,
          },
        });
        await transport.invoke(tool, params);
      },

      invokePrompt: async (prompt, args) => {
        await transport.invokePrompt(prompt, args);
      },

      // ---------- saved request loading ----------
      loadSavedRequest: (request) => {
        const conn = request.connectionConfig;
        let transport: "stdio" | "http" = "stdio";
        let connectionUrl = "";
        if (conn) {
          transport = conn.transport === "http" ? "http" : "stdio";
          connectionUrl =
            conn.transport === "http"
              ? conn.config.url
              : [conn.config.command, ...conn.config.args].join(" ");
        }
        set({
          selectedTool: null,
          selectedPrompt: null,
          pendingParams: null,
          activeView: "studio",
          selectedRequestId: request.id,
          transport,
          connectionUrl,
        });
      },

      clearPendingParams: () => set({ pendingParams: null }),

      // ---------- logs ----------
      clearLogs: () => set({ logs: [], logIdCounter: 0 }),

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
        await fetch(`/api/collections/${id}`, { method: "DELETE" });
        set((s) => {
          const deletedReqIds = new Set(
            s.collections.find((c) => c.id === id)?.requests.map((r) => r.id) ?? []
          );
          return {
            collections: s.collections.filter((c) => c.id !== id),
            selectedRequestId: deletedReqIds.has(s.selectedRequestId ?? "") ? null : s.selectedRequestId,
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

      deleteRequest: async (collectionId, reqId) => {
        await fetch(`/api/collections/${collectionId}/requests/${reqId}`, { method: "DELETE" });
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) }
              : c
          ),
          selectedRequestId: s.selectedRequestId === reqId ? null : s.selectedRequestId,
        }));
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
      setTransport: (t) => set({ transport: t }),
      setConnectionUrl: (url) => set({ connectionUrl: url }),

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
  const store = useStore.getState();

  const addLog = (level: LogEntry["level"], source: LogEntry["source"], text: string) => {
    useStore.setState((s) => ({
      logIdCounter: s.logIdCounter + 1,
      logs: [
        ...s.logs,
        { id: `log_${s.logIdCounter}`, level, source, text, timestamp: Date.now() },
      ].slice(-500),
    }));
  };

  switch (msg.type) {
    case "status":
      useStore.setState({ connectionStatus: msg.status });
      break;

    case "connected":
      useStore.setState({
        connectionStatus: "connected",
        tools: msg.tools,
        prompts: msg.prompts,
        serverInfo: msg.serverInfo,
      });
      addLog("info", "protocol", `Connected — ${msg.tools.length} tools, ${msg.prompts.length} prompts`);
      break;

    case "disconnected":
      useStore.setState({ connectionStatus: "disconnected", tools: [], prompts: [] });
      break;

    case "chunk":
      useStore.setState((s) => ({
        response: { ...s.response, chunks: [...s.response.chunks, msg.data] },
      }));
      break;

    case "result":
      useStore.setState((s) => ({
        response: { ...s.response, result: msg.data, isStreaming: false, completedAt: Date.now() },
      }));
      break;

    case "prompt_result":
      useStore.setState((s) => ({
        response: { ...s.response, result: msg.messages, isStreaming: false, completedAt: Date.now() },
      }));
      break;

    case "error":
      if (msg.code === "CONNECTION_FAILED") {
        useStore.setState({ connectionStatus: "error" });
        store.addToast({ title: "Connection failed", description: msg.message, variant: "destructive" });
      } else {
        useStore.setState((s) => ({
          response: { ...s.response, error: msg.message, isStreaming: false, completedAt: Date.now() },
        }));
      }
      addLog("error", "protocol", msg.message);
      break;

    case "log":
      addLog(msg.level, msg.source, msg.text);
      break;

    case "tools_listed":
      useStore.setState({ tools: msg.tools });
      break;

    case "prompts_listed":
      useStore.setState({ prompts: msg.prompts });
      break;
  }
}
