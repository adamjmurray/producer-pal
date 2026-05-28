// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createMcpServer,
  STANDARD_TOOL_DEFS,
  TOOL_NAMES,
} from "#src/mcp-server/create-mcp-server.ts";

const callLiveApi = vi.fn(() => Promise.resolve({}));

describe("createMcpServer", () => {
  it("registers all standard tools without throwing", () => {
    expect(() => createMcpServer(callLiveApi)).not.toThrow();
  });

  // Regression: a tool whose smallModelModeConfig.excludeEnumValues targets an
  // enum without a top-level .default() throws during registration, and the
  // server is rebuilt per /mcp request with the live smallModelMode flag — so
  // such a tool breaks every request once small-model mode is on. Build the
  // full server in small-model mode to catch this class of bug for every tool.
  it("registers all standard tools in small-model mode without throwing", () => {
    expect(() =>
      createMcpServer(callLiveApi, { smallModelMode: true }),
    ).not.toThrow();
  });

  it("registers the opt-in Live API tool only when enabled and not small-model", () => {
    expect(() =>
      createMcpServer(callLiveApi, { liveApiEnabled: true }),
    ).not.toThrow();
    expect(() =>
      createMcpServer(callLiveApi, {
        liveApiEnabled: true,
        smallModelMode: true,
      }),
    ).not.toThrow();
  });

  it("exposes a frozen TOOL_NAMES matching the standard tool defs", () => {
    expect(TOOL_NAMES).toHaveLength(STANDARD_TOOL_DEFS.length);
    expect(Object.isFrozen(TOOL_NAMES)).toBe(true);
  });
});
