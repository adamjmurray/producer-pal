// Producer Pal
// Copyright (C) 2026 Adam Murray, Eike Haß
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleListen } from "../listen-handler.ts";
import { createMcpServer } from "../create-mcp-server.ts";

vi.mock(import("../listen-handler.ts"), () => ({
  handleListen: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "description" }],
  }),
}));

vi.mock(import("../node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

const mockCallLiveApi = vi.fn();

describe("createMcpServer", () => {
  describe("listen tool registration", () => {
    let originalEnableListen: string | undefined;
    let originalEnableRawLiveApi: string | undefined;

    beforeEach(() => {
      originalEnableListen = process.env.ENABLE_LISTEN;
      originalEnableRawLiveApi = process.env.ENABLE_RAW_LIVE_API;
    });

    afterEach(() => {
      if (originalEnableListen === undefined) {
        delete process.env.ENABLE_LISTEN;
      } else {
        process.env.ENABLE_LISTEN = originalEnableListen;
      }

      if (originalEnableRawLiveApi === undefined) {
        delete process.env.ENABLE_RAW_LIVE_API;
      } else {
        process.env.ENABLE_RAW_LIVE_API = originalEnableRawLiveApi;
      }
    });

    it("should create server without error when ENABLE_LISTEN is true", () => {
      process.env.ENABLE_LISTEN = "true";
      expect(() => createMcpServer(mockCallLiveApi)).not.toThrow();
    });

    it("should create server without error when ENABLE_LISTEN is not set", () => {
      delete process.env.ENABLE_LISTEN;
      expect(() => createMcpServer(mockCallLiveApi)).not.toThrow();
    });

    it("should create server without error in small model mode with ENABLE_LISTEN", () => {
      process.env.ENABLE_LISTEN = "true";
      expect(() =>
        createMcpServer(mockCallLiveApi, { smallModelMode: true }),
      ).not.toThrow();
    });

    it("should invoke handleListen when ppal-listen tool handler is called", async () => {
      process.env.ENABLE_LISTEN = "true";
      const server = createMcpServer(mockCallLiveApi);
      // Access internal tool registry to invoke the handler directly
      const tools = (
        server as unknown as {
          _registeredTools: Record<
            string,
            { handler: (args: unknown) => unknown }
          >;
        }
      )._registeredTools;
      const listenTool = tools["ppal-listen"];

      expect(listenTool).toBeDefined();
      await listenTool!.handler({});

      expect(vi.mocked(handleListen)).toHaveBeenCalledWith(mockCallLiveApi, {});
    });
  });
});
