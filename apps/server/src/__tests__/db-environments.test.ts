import { beforeEach, describe, expect, it } from "bun:test";
import { clearDb } from "./helpers/clear-db.js";
import {
  createEnvironment,
  deleteEnvironment,
  getAllEnvironments,
  getActiveEnvironment,
  updateEnvironment,
} from "../db/queries/environments.js";

beforeEach(clearDb);

describe("environments", () => {
  it("auto-creates a Local default when empty", async () => {
    const envs = await getAllEnvironments();
    expect(envs).toHaveLength(1);
    expect(envs[0]!.name).toBe("Local");
  });

  it("creates and retrieves an environment", async () => {
    await createEnvironment("Staging");
    const envs = await getAllEnvironments();
    const staging = envs.find((e) => e.name === "Staging");
    expect(staging).toBeTruthy();
    expect(staging!.variables).toEqual({});
  });

  it("updates variables on an environment", async () => {
    const env = await createEnvironment("Dev");
    await updateEnvironment(env.id, { variables: { API_KEY: "abc123" } });
    const envs = await getAllEnvironments();
    const dev = envs.find((e) => e.id === env.id);
    expect(dev!.variables).toEqual({ API_KEY: "abc123" });
  });

  it("sets active environment and deactivates others", async () => {
    const a = await createEnvironment("A");
    const b = await createEnvironment("B");

    await updateEnvironment(a.id, { isActive: true });
    await updateEnvironment(b.id, { isActive: false });
    expect((await getActiveEnvironment())?.id).toBe(a.id);

    await updateEnvironment(a.id, { isActive: false });
    await updateEnvironment(b.id, { isActive: true });
    expect((await getActiveEnvironment())?.id).toBe(b.id);
  });

  it("deletes an environment", async () => {
    const env = await createEnvironment("Temp");
    await deleteEnvironment(env.id);
    const envs = await getAllEnvironments();
    expect(envs.find((e) => e.id === env.id)).toBeUndefined();
  });
});
