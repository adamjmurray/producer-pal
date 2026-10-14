// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The bridge's own answers for ppal-manage update-producer-pal, and the update
// hint it adds to ppal-connect.

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
import { StdioHttpBridge } from "../stdio-http-bridge.ts";
import { OLD, updateDeps } from "../update/tests/update-test-helpers.ts";

const MANAGE = { name: "ppal-manage", description: "", inputSchema: {} };
const UPDATE = callToolRequest("ppal-manage", {
  action: "update-producer-pal",
});

/**
 * @param offersManage - Whether the portal lists ppal-manage
 * @returns A bridge over the update dependencies
 */
function bridgeOver(offersManage: boolean): TestBridge {
  const bridge = new StdioHttpBridge(
    "http://localhost:3350/mcp",
    {},
    updateDeps(),
  ) as unknown as TestBridge;

  if (offersManage) {
    bridge.fallbackTools.tools.push(MANAGE);
  }

  return bridge;
}

/**
 * Make the connected server report these versions, one per handshake, the last
 * one for every later handshake.
 * @param versions - What successive handshakes report
 */
function serverReports(...versions: string[]): void {
  for (const version of versions.slice(0, -1)) {
    mockClient.getServerVersion.mockReturnValueOnce({ name: "d", version });
  }

  mockClient.getServerVersion.mockReturnValue({
    name: "d",
    version: versions.at(-1),
  });
}

describe("StdioHttpBridge update-producer-pal", () => {
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

  it("updates the device itself, reconnects to the new one and tells the client to re-list tools", async () => {
    serverReports(OLD, OLD, VERSION);

    const handler = await startAndGetCallHandler(bridgeOver(true));
    const result = await handler(UPDATE);

    expect(responseText(result as never)).toContain(
      `device:{from:"${OLD}",to:"${VERSION}"}`,
    );
    expect(mockClient.callTool).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mockServer.sendToolListChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("answers with the setup guidance when the device isn't running", async () => {
    mockClient.connect.mockRejectedValue(new Error("Connection failed"));

    const handler = await startAndGetCallHandler(bridgeOver(true));
    const result = (await handler(UPDATE)) as { isError: boolean };

    expect(result.isError).toBe(true);
    expect(responseText(result as never)).toContain("Producer Pal");
    expect(mockClient.callTool).not.toHaveBeenCalled();
  });

  it("leaves the call to the device when the portal doesn't offer ppal-manage", async () => {
    const forwarded = { content: [{ type: "text", text: "from the device" }] };

    mockClient.callTool.mockResolvedValue(forwarded);

    const handler = await startAndGetCallHandler(bridgeOver(false));

    expect(await handler(UPDATE)).toBe(forwarded);
    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
  });
});

describe("StdioHttpBridge ppal-connect update hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServer.connect.mockResolvedValue(undefined);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.callTool.mockImplementation(() =>
      Promise.resolve({ content: [{ type: "text", text: "connected" }] }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells the model to ask, then update, when the device is older", async () => {
    serverReports(OLD);

    const handler = await startAndGetCallHandler(bridgeOver(true));
    const result = (await handler(callToolRequest("ppal-connect"))) as {
      content: Array<{ text: string }>;
    };

    expect(result.content).toHaveLength(2);
    expect(result.content[1]?.text).toContain(
      `The Producer Pal device (${OLD}) is older than this connector (${VERSION}). Ask the user, then call ppal-manage action "update-producer-pal"`,
    );
  });

  it("adds nothing when the device is current", async () => {
    serverReports(VERSION);

    const handler = await startAndGetCallHandler(bridgeOver(true));
    const result = (await handler(callToolRequest("ppal-connect"))) as {
      content: unknown[];
    };

    expect(result.content).toHaveLength(1);
  });
});
