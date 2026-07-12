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

const OVERRIDE_ENV_VARS = [
  "SMALL_MODEL_MODE",
  "NOTATION",
  "FORMAT",
  "LIVE_API",
  "JSON_OUTPUT",
  "ALLOW_CONFIGURATION_OVERRIDES",
  "MCP_SERVER_ORIGIN",
] as const;

describe("producer-pal-portal", () => {
  const originalArgv = process.argv;
  const originalEnv = new Map(
    OVERRIDE_ENV_VARS.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    for (const name of OVERRIDE_ENV_VARS) delete process.env[name];
  });

  afterEach(() => {
    process.argv = originalArgv;

    for (const name of OVERRIDE_ENV_VARS) {
      restoreEnv(name, originalEnv.get(name));
    }
  });

  async function importPortalAndGetCalls(): Promise<unknown[][]> {
    vi.resetModules();

    const { StdioHttpBridge } = await import("./stdio-http-bridge.ts");

    await import("./producer-pal-portal.ts");

    return (StdioHttpBridge as unknown as Mock).mock.calls;
  }

  /**
   * Run the portal with the given argv (env is set by the caller) and return the
   * options object passed to the StdioHttpBridge constructor.
   * @param args - process.argv entries after `node script.js`
   * @returns The bridge options object
   */
  async function bridgeOptionsFor(args: string[]): Promise<unknown> {
    process.argv = ["node", "producer-pal-portal.js", ...args];

    const calls = await importPortalAndGetCalls();

    return calls[0]?.[1];
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

  it("passes empty options when no flags or env vars are set", async () => {
    expect(await bridgeOptionsFor([])).toStrictEqual({});
  });

  describe("CLI flags (never gated)", () => {
    it("enables small model mode with -s", async () => {
      expect(await bridgeOptionsFor(["-s"])).toStrictEqual({
        smallModelMode: true,
      });
    });

    it("enables small model mode with --small-model-mode", async () => {
      expect(await bridgeOptionsFor(["--small-model-mode"])).toStrictEqual({
        smallModelMode: true,
      });
    });

    it("enables the Direct Live API with --live-api", async () => {
      expect(await bridgeOptionsFor(["--live-api"])).toStrictEqual({
        liveApiEnabled: true,
      });
    });

    it("enables the Direct Live API with -l", async () => {
      expect(await bridgeOptionsFor(["-l"])).toStrictEqual({
        liveApiEnabled: true,
      });
    });

    it("passes notation from --notation <value>", async () => {
      expect(await bridgeOptionsFor(["--notation", "midi-json"])).toStrictEqual(
        {
          notation: "midi-json",
        },
      );
    });

    it("passes notation from --notation=<value>", async () => {
      expect(await bridgeOptionsFor(["--notation=stark"])).toStrictEqual({
        notation: "stark",
      });
    });

    it("passes notation from -n <value>", async () => {
      expect(await bridgeOptionsFor(["-n", "midi-json"])).toStrictEqual({
        notation: "midi-json",
      });
    });

    it("passes notation from -n=<value>", async () => {
      expect(await bridgeOptionsFor(["-n=stark"])).toStrictEqual({
        notation: "stark",
      });
    });

    it("normalizes notation case and surrounding whitespace", async () => {
      expect(
        await bridgeOptionsFor(["--notation", " MIDI-JSON "]),
      ).toStrictEqual({ notation: "midi-json" });
    });

    it("ignores an invalid --notation value", async () => {
      expect(await bridgeOptionsFor(["--notation", "bogus"])).toStrictEqual({});
    });

    it("requests JSON output from --format json", async () => {
      expect(await bridgeOptionsFor(["--format", "json"])).toStrictEqual({
        jsonOutput: true,
      });
    });

    it("requests compact output from --format compact", async () => {
      expect(await bridgeOptionsFor(["--format", "compact"])).toStrictEqual({
        jsonOutput: false,
      });
    });

    it("requests JSON output from -f json", async () => {
      expect(await bridgeOptionsFor(["-f", "json"])).toStrictEqual({
        jsonOutput: true,
      });
    });

    it("requests JSON output from --format=json", async () => {
      expect(await bridgeOptionsFor(["--format=json"])).toStrictEqual({
        jsonOutput: true,
      });
    });

    it("ignores an invalid --format value", async () => {
      expect(await bridgeOptionsFor(["--format", "bogus"])).toStrictEqual({});
    });

    it("combines multiple flags", async () => {
      expect(
        await bridgeOptionsFor(["--live-api", "--notation", "midi-json", "-s"]),
      ).toStrictEqual({
        smallModelMode: true,
        notation: "midi-json",
        liveApiEnabled: true,
      });
    });
  });

  describe("env vars (gated behind ALLOW_CONFIGURATION_OVERRIDES)", () => {
    it("ignores every override env var when the gate is off", async () => {
      process.env.SMALL_MODEL_MODE = "true";
      process.env.NOTATION = "stark";
      process.env.LIVE_API = "true";
      process.env.JSON_OUTPUT = "true";
      process.env.FORMAT = "json";

      expect(await bridgeOptionsFor([])).toStrictEqual({});
    });

    it("applies every override env var when the gate is on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.SMALL_MODEL_MODE = "true";
      process.env.NOTATION = "stark";
      process.env.LIVE_API = "true";
      process.env.JSON_OUTPUT = "true";

      expect(await bridgeOptionsFor([])).toStrictEqual({
        smallModelMode: true,
        notation: "stark",
        liveApiEnabled: true,
        jsonOutput: true,
      });
    });

    it("forces settings off with explicit false env values when gated on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.SMALL_MODEL_MODE = "false";
      process.env.LIVE_API = "false";
      process.env.JSON_OUTPUT = "false";

      expect(await bridgeOptionsFor([])).toStrictEqual({
        smallModelMode: false,
        liveApiEnabled: false,
        jsonOutput: false,
      });
    });

    it("ignores unrecognized boolean env values even when gated on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.SMALL_MODEL_MODE = "yes";
      process.env.LIVE_API = "";
      process.env.JSON_OUTPUT = "1";

      expect(await bridgeOptionsFor([])).toStrictEqual({});
    });

    it("normalizes and applies the NOTATION env var when gated on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.NOTATION = " MIDI-JSON ";

      expect(await bridgeOptionsFor([])).toStrictEqual({
        notation: "midi-json",
      });
    });

    it("treats an empty NOTATION env var as no override when gated on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.NOTATION = "";

      expect(await bridgeOptionsFor([])).toStrictEqual({});
    });

    it("requests JSON output from the FORMAT env var when gated on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.FORMAT = "json";

      expect(await bridgeOptionsFor([])).toStrictEqual({ jsonOutput: true });
    });

    it("does not treat 'true'/'false' gate values other than 'true' as on", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "1";
      process.env.SMALL_MODEL_MODE = "true";

      expect(await bridgeOptionsFor([])).toStrictEqual({});
    });
  });

  describe("flags win over gated env vars", () => {
    it("applies a flag even when the gate is off", async () => {
      process.env.NOTATION = "midi-json";

      expect(await bridgeOptionsFor(["--notation", "stark"])).toStrictEqual({
        notation: "stark",
      });
    });

    it("prefers the --notation flag over the NOTATION env var (gate on)", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.NOTATION = "midi-json";

      expect(await bridgeOptionsFor(["--notation", "stark"])).toStrictEqual({
        notation: "stark",
      });
    });

    it("prefers --format compact over FORMAT=json env (gate on)", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.FORMAT = "json";

      expect(await bridgeOptionsFor(["--format", "compact"])).toStrictEqual({
        jsonOutput: false,
      });
    });

    it("prefers --format compact over JSON_OUTPUT=true env (gate on)", async () => {
      process.env.ALLOW_CONFIGURATION_OVERRIDES = "true";
      process.env.JSON_OUTPUT = "true";

      expect(await bridgeOptionsFor(["--format", "compact"])).toStrictEqual({
        jsonOutput: false,
      });
    });
  });
});
