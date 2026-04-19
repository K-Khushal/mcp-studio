import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@mcp-studio/types";

// Import after globals are set up
const { useStore } = await import("../store/index.js");

const makeEnv = (overrides: Partial<Environment> = {}): Environment => ({
  id: "env-1",
  name: "Local",
  variables: {},
  isActive: true,
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ environments: [], activeEnvironmentId: null });
});

describe("loadEnvironments", () => {
  it("sets environments and activeEnvironmentId from response", async () => {
    const envs: Environment[] = [
      makeEnv({ id: "e1", isActive: false }),
      makeEnv({ id: "e2", name: "Staging", isActive: true }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => envs }));

    await useStore.getState().loadEnvironments();

    expect(useStore.getState().environments).toEqual(envs);
    expect(useStore.getState().activeEnvironmentId).toBe("e2");
  });

  it("sets activeEnvironmentId to null when none is active", async () => {
    const envs: Environment[] = [makeEnv({ isActive: false })];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => envs }));

    await useStore.getState().loadEnvironments();

    expect(useStore.getState().activeEnvironmentId).toBeNull();
  });
});

describe("createEnvironment", () => {
  it("appends the new environment to the store", async () => {
    const created = makeEnv({ id: "new-env", name: "Prod", isActive: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => created }));

    await useStore.getState().createEnvironment("Prod");

    expect(useStore.getState().environments).toHaveLength(1);
    expect(useStore.getState().environments[0]!.name).toBe("Prod");
  });
});

describe("setActiveEnvironment", () => {
  it("updates activeEnvironmentId and marks environments correctly", async () => {
    useStore.setState({
      environments: [
        makeEnv({ id: "a", isActive: true }),
        makeEnv({ id: "b", isActive: false }),
      ],
      activeEnvironmentId: "a",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({}) })
    );

    await useStore.getState().setActiveEnvironment("b");

    expect(useStore.getState().activeEnvironmentId).toBe("b");
    const envs = useStore.getState().environments;
    expect(envs.find((e) => e.id === "a")!.isActive).toBe(false);
    expect(envs.find((e) => e.id === "b")!.isActive).toBe(true);
  });
});
