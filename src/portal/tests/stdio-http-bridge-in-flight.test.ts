// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A reconnect (the update hint, ppal-manage update) must not cut off a call
// that is already on the old client.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  callToolRequest,
  mockServer,
  mockStandardTools,
  mockTransport,
  serverInfoCalls,
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

/** One client per connect, so the old and new can be told apart. */
interface FakeClient {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  getServerVersion: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted(() => ({
  clients: [] as FakeClient[],
  // What the first client answers to ppal-slow; every other call answers at once
  slow: null as Promise<unknown> | null,
  oldVersion: "",
}));
const clients = state.clients;

vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () =>
  partialModule({
    Client: vi.fn(function () {
      const client: FakeClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn(),
        callTool: vi.fn((request: { name: string }) =>
          request.name === "ppal-slow" && clients.length === 1
            ? state.slow
            : Promise.resolve({ content: [{ type: "text", text: "ok" }] }),
        ),
        getServerVersion: vi.fn(() => ({
          name: "d",
          version: state.oldVersion,
        })),
      };

      clients.push(client);

      return client;
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

import { StdioHttpBridge } from "../stdio-http-bridge.ts";
import { OLD } from "../update/tests/update-test-helpers.ts";

type Handler = (request: unknown) => Promise<unknown>;
type Result = { content: Array<{ type: string; text: string }> };

const SLOW = callToolRequest("ppal-slow");
const CONNECT = callToolRequest("ppal-connect");
const SLOW_RESULT = { content: [{ type: "text", text: "slow done" }] };

/** @returns A promise and the way to settle it */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/** @returns The call handler of a started bridge, and the bridge */
async function startBridge(): Promise<{
  handler: Handler;
  bridge: TestBridge;
}> {
  const bridge = new StdioHttpBridge(
    "http://localhost:3350/mcp",
  ) as unknown as TestBridge;

  return { handler: await startAndGetCallHandler(bridge), bridge };
}

describe("StdioHttpBridge reconnect with calls in flight", () => {
  beforeEach(() => {
    clients.length = 0;
    state.slow = null;
    state.oldVersion = OLD;
    mockServer.connect.mockResolvedValue(undefined);
    mockServer.sendToolListChanged.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets a call finish when the update hint reconnects meanwhile", async () => {
    const { handler, slow, first } = await startSlowCall();

    const connect = (await handler(CONNECT)) as Result;

    // The hint reconnected: a second client exists, the first is still open.
    expect(clients).toHaveLength(2);
    expect(clients[0]?.close).not.toHaveBeenCalled();
    expect(connect.content.at(-1)?.text).toContain(
      `The Producer Pal device (${OLD}) is older than this connector (${VERSION})`,
    );

    slow.resolve(SLOW_RESULT);

    expect(await first).toBe(SLOW_RESULT);
    await vi.waitFor(() => {
      expect(clients[0]?.close).toHaveBeenCalledTimes(1);
    });
  });

  it("closes the old client at once when nothing is on it", async () => {
    const { handler } = await startBridge();

    await handler(CONNECT);

    expect(clients).toHaveLength(2);
    expect(clients[0]?.close).toHaveBeenCalledTimes(1);
    expect(clients[1]?.close).not.toHaveBeenCalled();
  });

  it("keeps the new connection when a call on the old client fails after the swap", async () => {
    const { handler, slow, first } = await startSlowCall();

    await handler(CONNECT);

    const closed = Object.assign(new Error("Connection closed"), {
      code: -32000,
    });

    slow.reject(closed);
    await first;

    // The failed old call must not make the next call reconnect again.
    await handler(callToolRequest("ppal-read-live-set"));

    expect(clients).toHaveLength(2);
    expect(clients[1]?.close).not.toHaveBeenCalled();
  });

  it("closes a client still waiting on a call when the bridge stops", async () => {
    const slow = deferred<unknown>();

    state.slow = slow.promise;

    const { handler, bridge } = await startBridge();
    const first = handler(SLOW);

    await vi.waitFor(() => {
      expect(clients[0]?.callTool).toHaveBeenCalledTimes(1);
    });
    await handler(CONNECT);
    await bridge.stop();

    expect(clients[0]?.close).toHaveBeenCalledTimes(1);

    slow.resolve(SLOW_RESULT);
    await first;

    expect(clients[0]?.close).toHaveBeenCalledTimes(1);
  });
});

/**
 * Start a bridge with a slow call already on its first client.
 * @returns The handler, the slow call's control, and the call's promise
 */
async function startSlowCall() {
  const slow = deferred<unknown>();

  state.slow = slow.promise;

  const { handler } = await startBridge();
  const first = handler(SLOW);

  await vi.waitFor(() => {
    expect(clients[0]?.callTool).toHaveBeenCalledTimes(1);
  });

  return { handler, slow, first };
}
