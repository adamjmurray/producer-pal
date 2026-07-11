// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// Mock the StdioHttpBridge class
const mockBridge = {
  start: vi.fn(),
  stop: vi.fn(),
};

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("./stdio-http-bridge.ts"), () => ({
  StdioHttpBridge: vi.fn(function () {
    return mockBridge;
  }),
}));

vi.mock(import("./file-logger.ts"), () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Restore an env var to its pre-test value, deleting it when it was unset.
 * @param name - Environment variable name
 * @param original - The value captured before the test (undefined if unset)
 */
function restoreEnv(name: string, original: string | undefined): void {
  if (original !== undefined) {
    process.env[name] = original;
  } else {
    delete process.env[name];
  }
}

describe("producer-pal-portal", () => {
  const originalArgv = process.argv;
  const originalSmallModelMode = process.env.SMALL_MODEL_MODE;
  const originalNotation = process.env.NOTATION;
  const originalFormat = process.env.FORMAT;
  const originalLiveApi = process.env.LIVE_API;
  const originalJsonOutput = process.env.JSON_OUTPUT;
  const originalOrigin = process.env.MCP_SERVER_ORIGIN;

  beforeEach(() => {
    delete process.env.SMALL_MODEL_MODE;
    delete process.env.NOTATION;
    delete process.env.FORMAT;
    delete process.env.LIVE_API;
    delete process.env.JSON_OUTPUT;
    delete process.env.MCP_SERVER_ORIGIN;
  });

  afterEach(() => {
    process.argv = originalArgv;

    restoreEnv("SMALL_MODEL_MODE", originalSmallModelMode);
    restoreEnv("NOTATION", originalNotation);
    restoreEnv("FORMAT", originalFormat);
    restoreEnv("LIVE_API", originalLiveApi);
    restoreEnv("JSON_OUTPUT", originalJsonOutput);
    restoreEnv("MCP_SERVER_ORIGIN", originalOrigin);
  });

  async function importPortalAndGetCalls(): Promise<unknown[][]> {
    vi.resetModules();

    const { StdioHttpBridge } = await import("./stdio-http-bridge.ts");

    await import("./producer-pal-portal.ts");

    return (StdioHttpBridge as unknown as Mock).mock.calls;
  }

  it("creates StdioHttpBridge instance and calls start", async () => {
    const calls = await importPortalAndGetCalls();

    expect(mockBridge.start).toHaveBeenCalled();
    expect(calls[0]?.[0]).toMatch(/^http:\/\/localhost:\d+\/mcp$/);
  });

  it("strips a trailing slash from MCP_SERVER_ORIGIN to avoid //mcp", async () => {
    process.env.MCP_SERVER_ORIGIN = "http://localhost:3350/";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[0]).toBe("http://localhost:3350/mcp");
  });

  it("passes smallModelMode: false and no notation when no flag or env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("enables small model mode with -s flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "-s"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: true,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("enables small model mode with --small-model-mode flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--small-model-mode"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: true,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("enables small model mode with SMALL_MODEL_MODE env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.SMALL_MODEL_MODE = "true";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: true,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("passes notation from the --notation <value> flag", async () => {
    process.argv = [
      "node",
      "producer-pal-portal.js",
      "--notation",
      "midi-json",
    ];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "midi-json",
      jsonOutput: undefined,
    });
  });

  it("passes notation from the --notation=<value> flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--notation=stark"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "stark",
      jsonOutput: undefined,
    });
  });

  it("passes notation from the NOTATION env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.NOTATION = "midi-json";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "midi-json",
      jsonOutput: undefined,
    });
  });

  it("ignores an invalid --notation value and leaves notation unset", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--notation", "bogus"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("prefers the --notation flag over the NOTATION env var", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--notation", "stark"];
    process.env.NOTATION = "midi-json";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "stark",
      jsonOutput: undefined,
    });
  });

  it("passes notation from the -n short flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "-n", "midi-json"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "midi-json",
      jsonOutput: undefined,
    });
  });

  it("passes notation from the -n=<value> short flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "-n=stark"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "stark",
      jsonOutput: undefined,
    });
  });

  it("normalizes notation case and surrounding whitespace", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.NOTATION = "  MIDI-JSON  ";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "midi-json",
      jsonOutput: undefined,
    });
  });

  it("treats an empty NOTATION value as no override", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.NOTATION = "";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("requests JSON output from the --format json flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format", "json"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: true,
    });
  });

  it("requests compact output from the --format compact flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format", "compact"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: false,
    });
  });

  it("requests JSON output from the -f short flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "-f", "json"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: true,
    });
  });

  it("requests JSON output from the --format=json flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format=json"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: true,
    });
  });

  it("requests JSON output from the FORMAT env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.FORMAT = "json";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: true,
    });
  });

  it("ignores an invalid --format value and leaves jsonOutput unset", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format", "bogus"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("prefers the --format flag over the FORMAT env var", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format", "compact"];
    process.env.FORMAT = "json";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: false,
    });
  });

  it("requests JSON output from the JSON_OUTPUT env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.JSON_OUTPUT = "true";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: true,
    });
  });

  it("leaves jsonOutput unset when JSON_OUTPUT is false", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.JSON_OUTPUT = "false";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
    });
  });

  it("prefers an explicit --format compact over JSON_OUTPUT=true", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--format", "compact"];
    process.env.JSON_OUTPUT = "true";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: false,
    });
  });

  it("enables the Direct Live API with the --live-api flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--live-api"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
      liveApiEnabled: true,
    });
  });

  it("enables the Direct Live API with the LIVE_API env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.LIVE_API = "true";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: undefined,
      jsonOutput: undefined,
      liveApiEnabled: true,
    });
  });

  it("omits liveApiEnabled entirely when the flag/env are unset", async () => {
    process.argv = ["node", "producer-pal-portal.js"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).not.toHaveProperty("liveApiEnabled");
  });

  it("combines --live-api with other overrides", async () => {
    process.argv = [
      "node",
      "producer-pal-portal.js",
      "--live-api",
      "--notation",
      "midi-json",
    ];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({
      smallModelMode: false,
      notation: "midi-json",
      jsonOutput: undefined,
      liveApiEnabled: true,
    });
  });
});
