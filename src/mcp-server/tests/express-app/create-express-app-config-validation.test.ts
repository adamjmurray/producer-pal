// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { nodeError } from "../../node-for-max-logger.ts";
import { describe, expect, it, vi } from "vitest";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  nodeLog: vi.fn(),
  nodeInfo: vi.fn(),
  nodeWarn: vi.fn(),
  nodeError: vi.fn(),
}));

describe("POST /config validation and device failures", () => {
  const appState = setupExpressAppServer();

  /**
   * @returns The current config, read back with GET /config
   */
  async function getConfig(): Promise<Record<string, unknown>> {
    const response = await fetch(appState.configUrl);
    const config: Record<string, unknown> = await response.json();

    return config;
  }

  it("applies nothing and emits nothing when any field is bad", async () => {
    const before = await getConfig();

    vi.mocked(Max.outlet).mockClear();

    const response = await appState.postConfig({
      smallModelMode: true,
      projectContext: "X",
      liveApiEnabled: true,
      tools: ["bogus"],
    });

    expect(response.status).toBe(400);
    expect(await getConfig()).toStrictEqual(before);
    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("names every bad field", async () => {
    const response = await appState.postConfig({
      projectContext: 123,
      smallModelMode: "false",
      jsonOutput: 1,
      liveApiEnabled: "yes",
      notation: "nope",
      tools: ["bogus"],
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(Object.keys(body.fields).toSorted()).toStrictEqual([
      "jsonOutput",
      "liveApiEnabled",
      "notation",
      "projectContext",
      "smallModelMode",
      "tools",
    ]);
    expect(body.error).toContain("smallModelMode");
    expect(body.error).toContain("bogus");
  });

  it("refuses a boolean sent as a string instead of reading it as true", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ smallModelMode: "false" });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.smallModelMode).toBe(before.smallModelMode);
  });

  it("refuses a non-string projectContext so ppal-connect can't break on it", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ projectContext: 123 });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.projectContext).toBe(before.projectContext);
  });

  it("refuses a tools list holding non-strings, such as a nested array", async () => {
    const before = await getConfig();
    const response = await appState.postConfig({ tools: [["ppal-connect"]] });

    expect(response.status).toBe(400);
    const after = await getConfig();

    expect(after.tools).toStrictEqual(before.tools);
  });

  it("still accepts a valid body", async () => {
    const response = await appState.postConfig({
      smallModelMode: false,
      projectContext: "ok",
      jsonOutput: false,
    });

    expect(response.status).toBe(200);
    await appState.postConfig({ projectContext: "" });
  });

  describe("when the device doesn't take a setting", () => {
    /**
     * Make sends of the named device settings fail; the rest succeed.
     *
     * @param keys - Device setting names whose send rejects
     * @returns The mock, to inspect which settings were sent
     */
    function failOutlets(...keys: string[]): ReturnType<typeof vi.fn> {
      const outlet = vi.fn((_channel: string, key: string) =>
        keys.includes(key)
          ? Promise.reject(new Error(`no ${key}`))
          : Promise.resolve(),
      );

      // A rejecting outlet is past what the responder API covers, so replace it;
      // resetMaxMock() puts the default back before the next test.
      Max.outlet = outlet as unknown as typeof Max.outlet;

      return outlet;
    }

    /**
     * Flip liveApiEnabled and check the call fails naming only that field.
     *
     * @param before - The config before the call
     * @returns The 502 body
     */
    async function flipLiveApiExpecting502(
      before: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const response = await appState.postConfig({
        liveApiEnabled: !before.liveApiEnabled,
      });
      const body: Record<string, unknown> = await response.json();

      expect(response.status).toBe(502);
      expect(body.fields).toStrictEqual(["liveApiEnabled"]);

      return body;
    }

    it("sends the rest, names the field that failed and rolls it back", async () => {
      const before = await getConfig();
      const outlet = failOutlets("notation");
      const response = await appState.postConfig({
        projectContext: "after",
        notation: before.notation === "midi-json" ? "bar-beat" : "midi-json",
        smallModelMode: !before.smallModelMode,
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.fields).toStrictEqual(["notation"]);
      expect(body.error).toContain("did not reach the device");
      expect(outlet.mock.calls.map(([, key]) => key)).toStrictEqual([
        "projectContext",
        "smallModelMode",
        "notation",
      ]);
      expect(nodeError).toHaveBeenCalledWith(
        expect.stringContaining("notation"),
      );

      // GET /config matches what the device has: the two that got through are
      // kept, the one that didn't is back to its old value.
      const after = await getConfig();

      expect(after.projectContext).toBe("after");
      expect(after.smallModelMode).toBe(!before.smallModelMode);
      expect(after.notation).toBe(before.notation);

      Max.outlet = vi.fn().mockResolvedValue(undefined);
      await appState.postConfig({
        projectContext: before.projectContext,
        smallModelMode: before.smallModelMode,
      });
    });

    it("names every field that failed, once each", async () => {
      const before = await getConfig();

      failOutlets("projectContext", "compactOutput");
      const response = await appState.postConfig({
        projectContext: "somewhere",
        jsonOutput: !before.jsonOutput,
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.fields.toSorted()).toStrictEqual([
        "jsonOutput",
        "projectContext",
      ]);
      const after = await getConfig();

      expect(after.projectContext).toBe(before.projectContext);
      expect(after.jsonOutput).toBe(before.jsonOutput);
    });

    it.each([
      // The send that fails, then the one that got through and is sent back.
      ["tools", "liveApiEnabled"],
      ["liveApiEnabled", "tools"],
    ])(
      "rolls the flag and the whitelist back together when the %s send fails",
      async (failing, putBack) => {
        const before = await getConfig();
        const outlet = failOutlets(failing);
        const body = await flipLiveApiExpecting502(before);

        expect(body.unrestored).toBeUndefined();
        const after = await getConfig();

        expect(after.tools).toStrictEqual(before.tools);
        expect(after.liveApiEnabled).toBe(before.liveApiEnabled);

        // What reached the device is sent back with its old value.
        expect(outlet).toHaveBeenLastCalledWith(
          "config",
          putBack,
          putBack === "tools"
            ? JSON.stringify(before.tools)
            : before.liveApiEnabled,
        );
      },
    );

    it("says so when a setting that reached the device cannot be put back", async () => {
      const before = await getConfig();
      const outlet = vi.fn((_channel: string, key: string) =>
        key === "tools" ||
        (key === "liveApiEnabled" &&
          outlet.mock.calls.filter(([, k]) => k === key).length > 1)
          ? Promise.reject(new Error(`no ${key}`))
          : Promise.resolve(),
      );

      Max.outlet = outlet as unknown as typeof Max.outlet;
      const body = await flipLiveApiExpecting502(before);

      expect(body.unrestored).toStrictEqual(["liveApiEnabled"]);
      expect(body.error).toContain("may hold a new value");
      const after = await getConfig();

      expect(after.liveApiEnabled).toBe(before.liveApiEnabled);
      expect(after.tools).toStrictEqual(before.tools);
    });

    it("keeps a setting that reached the device by another route", async () => {
      const before = await getConfig();

      // `tools` goes out with liveApiEnabled and on its own: one getting
      // through is enough, so the later one failing changes nothing. Sends are
      // tools, liveApiEnabled, tools: the third call fails.
      const outlet = vi.fn((_channel: string, key: string) =>
        key === "tools" && outlet.mock.calls.length === 3
          ? Promise.reject(new Error("no tools"))
          : Promise.resolve(),
      );

      Max.outlet = outlet as unknown as typeof Max.outlet;
      const response = await appState.postConfig({
        liveApiEnabled: !before.liveApiEnabled,
        tools: ["ppal-connect"],
      });

      expect(outlet).toHaveBeenCalledTimes(3);
      expect(response.status).toBe(200);
      const after = await getConfig();

      expect(after.tools).toStrictEqual(["ppal-connect"]);

      Max.outlet = vi.fn().mockResolvedValue(undefined);
      await appState.postConfig({
        liveApiEnabled: before.liveApiEnabled,
        tools: before.tools,
      });
    });

    it("answers as before when every send works", async () => {
      const before = await getConfig();
      const response = await appState.postConfig({ projectContext: "ok" });

      expect(response.status).toBe(200);
      expect(await response.json()).toStrictEqual({
        ...before,
        projectContext: "ok",
      });
      await appState.postConfig({ projectContext: before.projectContext });
    });
  });
});
