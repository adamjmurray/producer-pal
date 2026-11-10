// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Install, add and update share one budget counted from when the call arrives,
// even when the device's port accepts the connection and never answers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    ErrorCode: { ConnectionClosed: -32000, RequestTimeout: -32001 },
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
import { RemoteScriptTimeout } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import {
  happyDeps,
  LOADED,
  responseText,
} from "../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { CLIENT_TOOL_TIMEOUT_MS, VERSION } from "#src/shared/config.ts";
import { SETUP_BUDGET_MS } from "../setup/setup-deadline.ts";
import { StdioHttpBridge } from "../stdio-http-bridge.ts";
import { UPDATE_HINT_MS } from "../update/update-connect-hint.ts";
import { OLD } from "../update/tests/update-test-helpers.ts";

const MANAGE = { name: "ppal-manage", description: "", inputSchema: {} };

/** Slack for the 1 ms floor on a connect made once the budget is spent. */
const FLOOR_MS = 5;

/** Every connect hangs until the client is closed. */
function portNeverAnswers(): void {
  const stuck: Array<(error: Error) => void> = [];

  mockClient.connect.mockImplementation(
    () => new Promise<void>((_resolve, reject) => stuck.push(reject)),
  );
  mockClient.close.mockImplementation(() => {
    for (const reject of stuck.splice(0)) {
      reject(new Error("Connection closed"));
    }

    return Promise.resolve();
  });
}

/**
 * A remote script that refuses a request with no time left, as the real client
 * does, and records what it was sent.
 * @returns The dependencies, and the requests that left
 */
function clockedDeps(): { deps: OfflineDeps; sent: unknown[] } {
  const sent: unknown[] = [];
  const deps = happyDeps({
    now: () => Date.now(),
    request: vi.fn((request) => {
      if ((request.expiresInMs ?? 1) <= 0) {
        return Promise.reject(
          new RemoteScriptTimeout(
            "ran out of time before the request left",
            false,
          ),
        );
      }

      sent.push(request);

      return Promise.resolve(LOADED);
    }),
  });

  return { deps, sent };
}

/**
 * Start a tool call on a bridge whose port never answers.
 * @param request - The tool call
 * @param deps - What the portal's own answers reach out to
 * @returns When it finished (undefined while it hasn't), how to wait for it,
 *   and what it answered
 */
async function startCall(
  request: ReturnType<typeof callToolRequest>,
  deps: OfflineDeps = clockedDeps().deps,
): Promise<{
  elapsed: () => number | undefined;
  done: Promise<unknown>;
  text: () => string;
}> {
  portNeverAnswers();

  const bridge = new StdioHttpBridge(
    "http://localhost:3350/mcp",
    {},
    deps,
  ) as unknown as TestBridge;

  bridge.fallbackTools.tools.push(MANAGE);

  const handler = await startAndGetCallHandler(bridge);
  const started = Date.now();
  let finished: number | undefined;
  let answer = "";
  const done = Promise.resolve(handler(request)).then((result) => {
    finished = Date.now();
    answer = responseText(result as never);
  });

  return {
    elapsed: () => finished && finished - started,
    done,
    text: () => answer,
  };
}

/**
 * Make a ppal-manage call on a bridge whose port never answers, and let the
 * budget pass.
 * @param action - The ppal-manage action
 * @returns How long the call took on the fake clock; undefined if it never ended
 */
async function elapsedFor(
  action: string,
  deps?: OfflineDeps,
): Promise<number | undefined> {
  const call = await startCall(
    callToolRequest("ppal-manage", { action }),
    deps,
  );

  await vi.advanceTimersByTimeAsync(SETUP_BUDGET_MS + FLOOR_MS);

  return call.elapsed();
}

describe("StdioHttpBridge setup calls against a port that never answers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockServer.connect.mockResolvedValue(undefined);
    mockClient.connect.mockReset();
    mockClient.close.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["install-producer-pal", "install-remote-script"])(
    "answers %s within the budget, counted from the call's arrival",
    async (action) => {
      expect(await elapsedFor(action)).toBeLessThanOrEqual(
        SETUP_BUDGET_MS + FLOOR_MS,
      );
    },
  );

  it("answers add-producer-pal within the budget", async () => {
    expect(await elapsedFor("add-producer-pal")).toBeLessThanOrEqual(
      SETUP_BUDGET_MS + FLOOR_MS,
    );
  });

  it("sends the remote script nothing for an install, which only pings and copies files", async () => {
    const { deps, sent } = clockedDeps();

    expect(await elapsedFor("install-producer-pal", deps)).toBeLessThanOrEqual(
      SETUP_BUDGET_MS + FLOOR_MS,
    );
    expect(deps.request).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("refuses the device load, rather than sending it, once the hung connect has used the budget", async () => {
    const { deps, sent } = clockedDeps();
    const call = await startCall(
      callToolRequest("ppal-manage", { action: "add-producer-pal" }),
      deps,
    );

    await vi.advanceTimersByTimeAsync(SETUP_BUDGET_MS + FLOOR_MS);

    expect(call.text()).toContain(
      "ran out of time before the request reached Live, so nothing was added to the Set",
    );
    expect(deps.request).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("answers update-producer-pal within the budget", async () => {
    expect(await elapsedFor("update-producer-pal")).toBeLessThanOrEqual(
      SETUP_BUDGET_MS,
    );
  });

  it("leaves every other tool call on the SDK's default connect timeout", async () => {
    const call = await startCall(callToolRequest("ppal-read-live-set"));

    await vi.advanceTimersByTimeAsync(SETUP_BUDGET_MS + FLOOR_MS);

    expect(call.elapsed()).toBeUndefined();
    expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);

    await mockClient.close();
    await call.done;
  });

  it("answers ppal-connect within the hint's 5 s when its look at an older device hangs", async () => {
    // The call's own connect works; the hint's fresh one never answers.
    portNeverAnswers();
    mockClient.connect.mockImplementationOnce(() => Promise.resolve());
    mockClient.getServerVersion.mockReturnValue({ name: "d", version: OLD });
    mockClient.callTool.mockResolvedValue({
      content: [{ type: "text", text: "connected" }],
    });

    const bridge = new StdioHttpBridge(
      "http://localhost:3350/mcp",
      {},
      clockedDeps().deps,
    ) as unknown as TestBridge;
    const handler = await startAndGetCallHandler(bridge);
    const started = Date.now();
    let finished: number | undefined;
    let blocks: unknown[] = [];
    const done = Promise.resolve(handler(callToolRequest("ppal-connect"))).then(
      (result) => {
        finished = Date.now();
        blocks = (result as { content: unknown[] }).content;
      },
    );

    await vi.advanceTimersByTimeAsync(UPDATE_HINT_MS + FLOOR_MS);
    await done;

    expect(finished! - started).toBeLessThanOrEqual(UPDATE_HINT_MS + FLOOR_MS);
    // As if the device weren't older: no hint.
    expect(blocks).toStrictEqual([{ type: "text", text: "connected" }]);
  });
});

/** A device that reports `VERSION` and never answers a tool call, and the timeout each call was given. */
function deviceThatNeverAnswersTools(): { timeouts: number[] } {
  const timeouts: number[] = [];

  mockClient.getServerVersion.mockReturnValue({ name: "d", version: VERSION });
  mockClient.callTool.mockImplementation(
    (_request: unknown, _schema: unknown, options: { timeout: number }) =>
      new Promise((_resolve, reject) => {
        timeouts.push(options.timeout);
        setTimeout(
          () => reject(Object.assign(new Error("timed out"), { code: -32001 })),
          options.timeout,
        );
      }),
  );

  return { timeouts };
}

describe("StdioHttpBridge setup calls the device accepts and never answers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockServer.connect.mockResolvedValue(undefined);
    mockClient.connect.mockReset();
    mockClient.close.mockReset();
    mockClient.callTool.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * @param deps - What the portal's own answers reach out to
   * @param connected - Whether a client is already connected
   * @returns The call handler
   */
  async function handlerFor(deps: OfflineDeps, connected: boolean) {
    const bridge = new StdioHttpBridge(
      "http://localhost:3350/mcp",
      {},
      deps,
    ) as unknown as TestBridge;

    bridge.fallbackTools.tools.push(MANAGE);

    const handler = await startAndGetCallHandler(bridge);

    if (connected) {
      bridge.httpClient = mockClient;
      bridge.isConnected = true;
    }

    return handler;
  }

  it("bounds the install forwarded on a connected client by the budget, and says it may have run", async () => {
    const { timeouts } = deviceThatNeverAnswersTools();
    const handler = await handlerFor(clockedDeps().deps, true);
    const call = Promise.resolve(
      handler(
        callToolRequest("ppal-manage", { action: "install-producer-pal" }),
      ),
    ).then((result) => responseText(result as never));

    await vi.advanceTimersByTimeAsync(SETUP_BUDGET_MS - 1000);
    // Not answered yet: the old 65 s wait is gone, the new one isn't up.
    expect(timeouts).toStrictEqual([SETUP_BUDGET_MS]);

    await vi.advanceTimersByTimeAsync(1000 + FLOOR_MS);

    expect(await call).toContain("may or may not have finished");
  });

  it("gives the forwarded install only what the handshake left of the budget", async () => {
    const { timeouts } = deviceThatNeverAnswersTools();
    const handler = await handlerFor(clockedDeps().deps, false);

    // The handshake answers at 40 s; there is no version until it does.
    mockClient.connect.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 40_000)),
    );

    const call = Promise.resolve(
      handler(
        callToolRequest("ppal-manage", { action: "install-producer-pal" }),
      ),
    ).then((result) => responseText(result as never));

    await vi.advanceTimersByTimeAsync(SETUP_BUDGET_MS + FLOOR_MS);

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toBeLessThanOrEqual(SETUP_BUDGET_MS - 40_000);
    expect(await call).toContain("may or may not have finished");
  });

  it("sends nothing, and says nothing was installed, when the handshake took the whole budget", async () => {
    deviceThatNeverAnswersTools();

    let clock = 0;
    const deps = happyDeps({ now: () => clock });
    const handler = await handlerFor(deps, false);

    mockClient.connect.mockImplementation(() => {
      clock = SETUP_BUDGET_MS + 1000;

      return Promise.resolve();
    });

    const text = responseText(
      (await handler(
        callToolRequest("ppal-manage", { action: "install-producer-pal" }),
      )) as never,
    );

    expect(mockClient.callTool).not.toHaveBeenCalled();
    expect(text).toContain("nothing was installed");
    expect(text).not.toContain("may or may not");
  });

  it("keeps the 65 s timeout on every other tool call", async () => {
    const { timeouts } = deviceThatNeverAnswersTools();
    const handler = await handlerFor(clockedDeps().deps, true);

    void handler(callToolRequest("ppal-read-live-set"));
    await vi.advanceTimersByTimeAsync(0);

    expect(timeouts).toStrictEqual([CLIENT_TOOL_TIMEOUT_MS]);
  });
});
