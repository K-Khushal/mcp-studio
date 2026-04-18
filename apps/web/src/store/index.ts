import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  MCPTool,
  MCPPrompt,
  MCPConfig,
  ConnectionStatus,
  HistoryEntry,
  Collection,
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

  // Response
  response: ResponseState;

  // Logs
  logs: LogEntry[];
  logIdCounter: number;

  // History
  history: HistoryEntry[];
  diffSelection: [string, string] | null;

  // Collections
  collections: Collection[];

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
  activeView: "studio" | "collections" | "history" | "logs" | "settings";
  isLogsCollapsed: boolean;
  isDarkMode: boolean;

  // Toasts (managed externally via Radix, but tracked here)
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

  // Logs
  clearLogs: () => void;

  // History
  setDiffSelection: (ids: [string, string] | null) => void;
  loadHistory: () => Promise<void>;

  // Collections
  loadCollections: () => Promise<void>;
  saveCollection: (collections: Collection[]) => Promise<void>;

  // Environments
  loadEnvironments: () => Promise<void>;
  saveEnvironments: (envs: Environment[]) => Promise<void>;
  setActiveEnvironment: (id: string) => void;

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
      history: [],
      diffSelection: null,
      collections: [],
      environments: [],
      config: {
        requestTimeout: 30,
        autoScrollLogs: true,
        streamResponses: true,
        verboseLogging: false,
        showReasoning: true,
        showTimeline: true,
      },
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
      selectTool: (tool) => set({ selectedTool: tool, selectedPrompt: null }),
      setToolSearch: (q) => set({ toolSearch: q }),

      // ---------- prompts ----------
      selectPrompt: (prompt) => set({ selectedPrompt: prompt, selectedTool: null }),

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

      // ---------- logs ----------
      clearLogs: () => set({ logs: [], logIdCounter: 0 }),

      // ---------- history ----------
      setDiffSelection: (ids) => set({ diffSelection: ids }),
      loadHistory: async () => {
        const res = await fetch("/api/history");
        const history = (await res.json()) as HistoryEntry[];
        set({ history });
      },

      // ---------- collections ----------
      loadCollections: async () => {
        const res = await fetch("/api/collections");
        const collections = (await res.json()) as Collection[];
        set({ collections });
      },
      saveCollection: async (collections) => {
        await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(collections),
        });
        set({ collections });
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
      saveEnvironments: async (envs) => {
        await fetch("/api/environments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envs),
        });
        set({ environments: envs });
      },
      setActiveEnvironment: (id) => {
        const envs = get().environments.map((e) => ({ ...e, isActive: e.id === id }));
        get().saveEnvironments(envs).catch(console.error);
        set({ activeEnvironmentId: id });
      },

      // ---------- configuration ----------
      setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

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
// Module-level server message handler (avoids putting it inside the store type)
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
      store.loadHistory().catch(console.error);
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
