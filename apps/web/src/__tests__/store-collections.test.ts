import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection, SavedRequest } from "@mcp-studio/types";

const { useStore } = await import("../store/index.js");

const makeCollection = (): Collection => ({
  id: "col-1",
  name: "Collection",
  createdAt: 1,
  updatedAt: 1,
  requests: [
    {
      id: "req-1",
      collectionId: "col-1",
      name: "Original Name",
      connectionConfig: {
        transport: "http",
        config: {
          url: "http://localhost:4000",
          headers: {},
        },
      },
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "req-2",
      collectionId: "col-1",
      name: "Second Request",
      connectionConfig: {
        transport: "stdio",
        config: {
          command: "npx",
          args: ["@test/test-mcp"],
          env: {},
          inheritSystemEnv: true,
        },
      },
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

const makeSavedRequest = (): SavedRequest => ({
  id: "req-1",
  collectionId: "col-1",
  name: "Original Name",
  connectionConfig: {
    transport: "http",
    config: {
      url: "http://localhost:4000",
      headers: {},
    },
  },
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(() => {
  vi.restoreAllMocks();
  useStore.setState({
    collections: [makeCollection()],
    selectedRequestId: "req-1",
    connectedRequestId: null,
    connectedRequestCache: null,
    requestDrafts: {},
    tools: [],
    prompts: [],
    selectedTool: null,
    selectedPrompt: null,
    pendingParams: null,
    toolFormValues: {},
    response: {
      chunks: [],
      result: null,
      error: null,
      isStreaming: false,
      startedAt: null,
      completedAt: null,
    },
    timeline: [],
    logs: [],
    activeView: "studio",
    transport: "stdio",
    connectionUrl: "",
  });
});

describe("renameRequest", () => {
  it("updates the request name in the store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));

    await useStore.getState().renameRequest("col-1", "req-1", "Renamed Request");

    expect(useStore.getState().collections[0]!.requests[0]!.name).toBe("Renamed Request");
    expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/requests/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Request" }),
    });
  });
});

describe("updateRequestConnection", () => {
  it("updates the request connectionConfig in the store", async () => {
    const config = {
      transport: "http" as const,
      config: {
        url: "http://localhost:4100",
        headers: {},
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));

    await useStore.getState().updateRequestConnection("col-1", "req-1", config);

    expect(useStore.getState().collections[0]!.requests[0]!.connectionConfig).toEqual(config);
    expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/requests/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionConfig: config }),
    });
  });
});

describe("loadSavedRequest", () => {
  it("loads request-scoped connection data without deselecting on repeat click", () => {
    useStore.setState({
      selectedTool: { name: "old-tool" } as never,
      selectedPrompt: { name: "old-prompt" } as never,
      pendingParams: { stale: true },
      selectedRequestId: null,
      activeView: "collections",
      transport: "stdio",
      connectionUrl: "stale",
    });

    const request = makeSavedRequest();

    useStore.getState().loadSavedRequest(request);

    expect(useStore.getState().selectedRequestId).toBe("req-1");
    expect(useStore.getState().transport).toBe("http");
    expect(useStore.getState().connectionUrl).toBe("http://localhost:4000");
    expect(useStore.getState().selectedTool).toBeNull();
    expect(useStore.getState().selectedPrompt).toBeNull();
    expect(useStore.getState().pendingParams).toBeNull();
    expect(useStore.getState().activeView).toBe("studio");

    useStore.getState().loadSavedRequest(request);

    expect(useStore.getState().selectedRequestId).toBe("req-1");
    expect(useStore.getState().transport).toBe("http");
    expect(useStore.getState().connectionUrl).toBe("http://localhost:4000");
    expect(useStore.getState().activeView).toBe("studio");
  });

  it("shows a blank workspace for a different selected request while another request stays connected", () => {
    useStore.setState({
      selectedRequestId: "req-1",
      connectedRequestId: "req-1",
      connectedRequestCache: {
        requestId: "req-1",
        tools: [{ name: "tool-a" }] as never,
        prompts: [{ name: "prompt-a" }] as never,
        selectedTool: { name: "tool-a" } as never,
        selectedPrompt: null,
        toolSearch: "find",
        pendingParams: { id: 1 },
        toolFormValues: { query: "abc" },
        response: {
          chunks: [{ foo: "bar" }],
          result: { ok: true },
          error: null,
          isStreaming: false,
          startedAt: 1,
          completedAt: 2,
        },
        timeline: [{ label: "done", detail: "ok", timestamp: "00:00:00", status: "completed" }],
        logs: [{ id: "log_1", level: "INFO", source: "protocol", message: "connected", timestamp: 1 }],
      },
      tools: [{ name: "tool-a" }] as never,
      prompts: [{ name: "prompt-a" }] as never,
      selectedTool: { name: "tool-a" } as never,
      toolSearch: "find",
      pendingParams: { id: 1 },
      toolFormValues: { query: "abc" },
      response: {
        chunks: [{ foo: "bar" }],
        result: { ok: true },
        error: null,
        isStreaming: false,
        startedAt: 1,
        completedAt: 2,
      },
      timeline: [{ label: "done", detail: "ok", timestamp: "00:00:00", status: "completed" }],
      logs: [{ id: "log_1", level: "INFO", source: "protocol", message: "connected", timestamp: 1 }],
    });

    const secondRequest = useStore.getState().collections[0]!.requests[1]!;
    useStore.getState().loadSavedRequest(secondRequest);

    const state = useStore.getState();
    expect(state.selectedRequestId).toBe("req-2");
    expect(state.connectedRequestId).toBe("req-1");
    expect(state.transport).toBe("stdio");
    expect(state.connectionUrl).toBe("npx @test/test-mcp");
    expect(state.tools).toEqual([]);
    expect(state.prompts).toEqual([]);
    expect(state.selectedTool).toBeNull();
    expect(state.response.result).toBeNull();
    expect(state.timeline).toEqual([]);
    expect(state.logs).toEqual([]);
  });

  it("restores the cached live workspace when returning to the connected request", () => {
    const cachedLogs = [{ id: "log_1", level: "INFO", source: "protocol", message: "connected", timestamp: 1 }] as const;
    useStore.setState({
      connectedRequestId: "req-1",
      connectedRequestCache: {
        requestId: "req-1",
        tools: [{ name: "tool-a" }] as never,
        prompts: [{ name: "prompt-a" }] as never,
        selectedTool: { name: "tool-a" } as never,
        selectedPrompt: null,
        toolSearch: "find",
        pendingParams: null,
        toolFormValues: { query: "abc" },
        response: {
          chunks: [],
          result: { ok: true },
          error: null,
          isStreaming: false,
          startedAt: 1,
          completedAt: 2,
        },
        timeline: [{ label: "done", detail: "ok", timestamp: "00:00:00", status: "completed" }],
        logs: [...cachedLogs],
      },
      selectedRequestId: "req-2",
      tools: [],
      prompts: [],
      selectedTool: null,
      selectedPrompt: null,
      toolSearch: "",
      pendingParams: null,
      toolFormValues: {},
      response: {
        chunks: [],
        result: null,
        error: null,
        isStreaming: false,
        startedAt: null,
        completedAt: null,
      },
      timeline: [],
      logs: [],
    });

    const firstRequest = useStore.getState().collections[0]!.requests[0]!;
    useStore.getState().loadSavedRequest(firstRequest);

    const state = useStore.getState();
    expect(state.selectedRequestId).toBe("req-1");
    expect(state.connectedRequestId).toBe("req-1");
    expect(state.tools).toHaveLength(1);
    expect(state.prompts).toHaveLength(1);
    expect(state.selectedTool?.name).toBe("tool-a");
    expect(state.toolFormValues).toEqual({ query: "abc" });
    expect(state.response.result).toEqual({ ok: true });
    expect(state.logs).toEqual(cachedLogs);
  });
});
