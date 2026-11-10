// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A bridge pointed at another computer answers nothing from this machine: no
// ping, no file lookups, no install or update copy.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  callToolRequest,
  mockClient,
  mockServer,
  serverInfoCalls,
  mockStandardTools,
  mockTransport,
  startAndGetCallHandler,
  type TestBridge,
} from "./stdio-http-bridge-test-helpers.ts";

/**
 * A stand-in for a module with only the exports the code under test reads.
 * Typed `never` so it fits any module's `vi.mock` factory. A function
 * declaration, so it exists when the hoisted factories run.
 * @param exports - The exports to supply
 * @returns The same object
 */
function partialModule(exports: object): never {
  return exports as never;
}

// Partial stand-ins for the SDK and the server factory; the objects live in the
// helper module.
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () =>
  partialModule({
    Client: vi.fn(function () {
      return mockClient;
    }),
  }),
);

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () =>
  partialModule({
    StreamableHTTPClientTransport: vi.fn(function () {
      return mockTransport;
    }),
  }),
);

vi.mock(import("@modelcontextprotocol/sdk/server/index.js"), () =>
  partialModule({
    Server: vi.fn(function (info: unknown) {
      serverInfoCalls.push(info);

      return mockServer;
    }),
  }),
);

vi.mock(import("@modelcontextprotocol/sdk/server/stdio.js"), () =>
  partialModule({
    StdioServerTransport: vi.fn(function () {
      return mockTransport;
    }),
  }),
);

vi.mock(import("@modelcontextprotocol/sdk/types.js"), () =>
  partialModule({
    CallToolRequestSchema: "CallToolRequestSchema",
    ListToolsRequestSchema: "ListToolsRequestSchema",
    ErrorCode: { ConnectionClosed: -32000 },
  }),
);

vi.mock(import("#src/mcp-server/create-mcp-server.ts"), () =>
  partialModule({
    createMcpServer: vi.fn(() => ({ _registeredTools: mockStandardTools })),
  }),
);

vi.mock(import("zod"), () =>
  partialModule({ z: { toJSONSchema: vi.fn((schema: unknown) => schema) } }),
);

vi.mock(import("../file-logger.ts"), () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import the class after mocking
import { responseText } from "../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  expectNothingTouched,
  fakeOfflineDeps,
} from "../offline/tests/offline-test-helpers.ts";
import { StdioHttpBridge } from "../stdio-http-bridge.ts";
import { OLD } from "../update/tests/update-test-helpers.ts";

const MANAGE = { name: "ppal-manage", description: "", inputSchema: {} };
const REMOTE = "http://192.168.1.20:3350/mcp";
const HOST = "192.168.1.20:3350";

/**
 * @param url - The device's MCP URL
 * @param offersManage - Whether the portal lists ppal-manage
 * @returns A bridge whose offline dependencies all fail the test when used
 */
function bridgeAt(url: string, offersManage = true): TestBridge {
  const bridge = new StdioHttpBridge(
    url,
    {},
    fakeOfflineDeps(),
  ) as unknown as TestBridge;

  if (offersManage) {
    bridge.fallbackTools.tools.push(MANAGE);
  }

  return bridge;
}

/**
 * @param request - The tool call
 * @param offersManage - Whether the portal lists ppal-manage
 * @returns The response text and whether it was an error
 */
async function call(
  request: { params: { name: string; arguments?: Record<string, unknown> } },
  offersManage = true,
): Promise<{ text: string; isError: boolean }> {
  const handler = await startAndGetCallHandler(bridgeAt(REMOTE, offersManage));
  const result = (await handler(request)) as { isError: boolean };

  return { text: responseText(result as never), isError: result.isError };
}

describe("StdioHttpBridge with a device on another computer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServer.connect.mockResolvedValue(undefined);
    mockServer.sendToolListChanged.mockResolvedValue(undefined);
    mockClient.connect.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses update-producer-pal without even connecting", async () => {
    const { text, isError } = await call(
      callToolRequest("ppal-manage", { action: "update-producer-pal" }),
    );

    expect(isError).toBe(true);
    expect(text).toContain(`another computer (${HOST})`);
    expect(text).toContain("can't update Producer Pal there");
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it.each(["install-producer-pal", "add-producer-pal"])(
    "refuses %s when the device is down",
    async (action) => {
      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const { text, isError } = await call(
        callToolRequest("ppal-manage", { action }),
      );

      expect(isError).toBe(true);
      expect(text).toContain(`another computer (${HOST})`);
    },
  );

  it("refuses install-producer-pal when the running device is older", async () => {
    mockClient.getServerVersion.mockReturnValue({ name: "d", version: OLD });

    const { text } = await call(
      callToolRequest("ppal-manage", { action: "install-producer-pal" }),
    );

    expect(text).toContain("can't install Producer Pal there");
    expect(text).toContain("Producer Pal there is older than this connector.");
    expect(mockClient.callTool).not.toHaveBeenCalled();
  });

  it("forwards install-producer-pal to a device that isn't older", async () => {
    mockClient.getServerVersion.mockReturnValue({
      name: "d",
      version: VERSION,
    });
    mockClient.callTool.mockResolvedValue({
      content: [{ type: "text", text: "from the device" }],
    });

    const { text } = await call(
      callToolRequest("ppal-manage", { action: "install-producer-pal" }),
    );

    expect(text).toBe("from the device");
  });

  it.each([
    ["a tool call", callToolRequest("ppal-read-live-set")],
    ["undo", callToolRequest("ppal-manage", { action: "undo" })],
    ["a call with no arguments", { params: { name: "ppal-connect" } }],
  ])(
    "gives %s the remote guidance when the device is down",
    async (_l, request) => {
      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const { text, isError } = await call(request);

      expect(isError).toBe(true);
      expect(text).toContain(`Producer Pal at ${HOST} didn't answer.`);
      expect(text).toContain("Allow other devices to connect");
      expect(text).not.toContain("Cannot connect to Ableton Live");
    },
  );

  it("looks at nothing on this machine for any of those", async () => {
    mockClient.connect.mockRejectedValue(new Error("Connection failed"));

    const deps = fakeOfflineDeps();
    const bridge = new StdioHttpBridge(
      REMOTE,
      {},
      deps,
    ) as unknown as TestBridge;

    bridge.fallbackTools.tools.push(MANAGE);

    const handler = await startAndGetCallHandler(bridge);

    for (const action of [
      "update-producer-pal",
      "install-producer-pal",
      "add-producer-pal",
      "undo",
    ]) {
      await handler(callToolRequest("ppal-manage", { action }));
    }

    await handler(callToolRequest("ppal-connect"));

    expectNothingTouched(deps);
  });

  it("gives guidance, not a refusal, when the portal doesn't offer ppal-manage", async () => {
    mockClient.connect.mockRejectedValue(new Error("Connection failed"));

    const { text } = await call(
      callToolRequest("ppal-manage", { action: "add-producer-pal" }),
      false,
    );

    expect(text).toContain(`Producer Pal at ${HOST} didn't answer.`);
  });
});
