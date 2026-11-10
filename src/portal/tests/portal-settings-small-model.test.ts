// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import {
  startStatelessMcpServer,
  type StatelessMcpServer,
} from "#src/mcp-server/helpers/http/stateless-mcp.ts";
import { callerSmallModelMode } from "../portal-settings.ts";

const MCP_URL = "http://localhost:3350/mcp";

let device: StatelessMcpServer | undefined;

/**
 * @param createServer - Builds the device's MCP server for each request
 * @returns The running device's MCP URL
 */
async function startDevice(createServer: () => McpServer): Promise<string> {
  device = await startStatelessMcpServer(createServer);

  return device.url;
}

/**
 * @param input - A fetch target
 * @returns Whether it is GET /config
 */
function isConfigRequest(input: string | URL | Request): boolean {
  const url = input instanceof Request ? input.url : input.toString();

  return url.endsWith("/config");
}

/**
 * Answer GET /config with this body; every other request goes to the network.
 * @param body - The /config body
 * @returns The fetch spy
 */
function stubConfig(body: unknown) {
  const realFetch = globalThis.fetch;

  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input, init) =>
      isConfigRequest(input)
        ? Promise.resolve(Response.json(body))
        : realFetch(input, init),
    );
}

describe("callerSmallModelMode", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await device?.close();
    device = undefined;
  });

  it.each([true, false])(
    "uses the portal's own setting (%s) without asking the device",
    async (setting) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await callerSmallModelMode(setting, MCP_URL)).toBe(setting);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "reads the device's setting (%s) over /mcp when the portal has none",
    async (on) => {
      const url = await startDevice(() =>
        createMcpServer(vi.fn(), { smallModelMode: on }),
      );
      const fetchSpy = stubConfig({ smallModelMode: !on });

      expect(await callerSmallModelMode(undefined, url)).toBe(on);
      expect(
        fetchSpy.mock.calls.some(([input]) => isConfigRequest(input)),
      ).toBe(false);
    },
  );

  it("reads GET /config from a device that doesn't report it over /mcp", async () => {
    const url = await startDevice(
      () => new McpServer({ name: "old", version: "1.0.0" }),
    );
    const fetchSpy = stubConfig({ smallModelMode: true });

    expect(await callerSmallModelMode(undefined, url)).toBe(true);
    expect(fetchSpy.mock.calls.some(([input]) => isConfigRequest(input))).toBe(
      true,
    );
  });

  it("is false for an old device whose config lacks the setting", async () => {
    const url = await startDevice(
      () => new McpServer({ name: "old", version: "1.0.0" }),
    );

    stubConfig({});

    expect(await callerSmallModelMode(undefined, url)).toBe(false);
  });

  it("is false when the device can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(false);
  });

  it("is false for an answer that isn't MCP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope"));

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(false);
  });

  it("is false when the device never answers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );

    expect(await callerSmallModelMode(undefined, MCP_URL, 5)).toBe(false);
  });

  it.each([
    ["an empty body", ""],
    ["a page that isn't MCP", "<html>proxy</html>"],
    ["an event stream with no data line", "event: message\n\n"],
  ])("asks GET /config when /mcp answers %s", async (_name, initializeBody) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      Promise.resolve(
        isConfigRequest(input)
          ? Response.json({ smallModelMode: true })
          : new Response(initializeBody),
      ),
    );

    expect(await callerSmallModelMode(undefined, MCP_URL)).toBe(true);
  });

  it("asks GET /config when /mcp times out", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
      isConfigRequest(input)
        ? Promise.resolve(Response.json({ smallModelMode: true }))
        : new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
    );

    expect(await callerSmallModelMode(undefined, MCP_URL, 5)).toBe(true);
  });
});
