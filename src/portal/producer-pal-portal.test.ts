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

describe("producer-pal-portal", () => {
  const originalArgv = process.argv;
  const originalSmallModelMode = process.env.SMALL_MODEL_MODE;

  beforeEach(() => {
    delete process.env.SMALL_MODEL_MODE;
  });

  afterEach(() => {
    process.argv = originalArgv;

    if (originalSmallModelMode !== undefined) {
      process.env.SMALL_MODEL_MODE = originalSmallModelMode;
    } else {
      delete process.env.SMALL_MODEL_MODE;
    }
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

  it("passes smallModelMode: false when no flag or env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({ smallModelMode: false });
  });

  it("enables small model mode with -s flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "-s"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({ smallModelMode: true });
  });

  it("enables small model mode with --small-model-mode flag", async () => {
    process.argv = ["node", "producer-pal-portal.js", "--small-model-mode"];

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({ smallModelMode: true });
  });

  it("enables small model mode with SMALL_MODEL_MODE env var", async () => {
    process.argv = ["node", "producer-pal-portal.js"];
    process.env.SMALL_MODEL_MODE = "true";

    const calls = await importPortalAndGetCalls();

    expect(calls[0]?.[1]).toStrictEqual({ smallModelMode: true });
  });
});
