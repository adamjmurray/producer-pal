// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, vi } from "vitest";
import "./expect-extensions.ts";
import { Folder, clearMockFolderStructure } from "./mocks/mock-folder.ts";
import {
  LiveAPI,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "./mocks/mock-live-api.ts";
import { clearMockRegistry } from "./mocks/mock-registry.ts";
import { Task } from "./mocks/mock-task.ts";

const g = globalThis as Record<string, unknown>;

g.LiveAPI = LiveAPI;
g.Folder = Folder;
await import("#src/live-api-adapter/live-api-extensions.ts");

g.Task = Task;
g.outlet = vi.fn();

type McpResponseHandler = (requestId: string, response: string) => void;

class Max {
  static post = vi.fn();

  static POST_LEVELS = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
  };

  static mcpResponseHandler: McpResponseHandler | null = null;
  static defaultMcpResponseHandler: McpResponseHandler | null = null; // Store the default handler
  static handlers: Map<string, (...args: unknown[]) => unknown> = new Map(); // Store all handlers

  static addHandler = vi.fn(
    (message: string, handler: (...args: unknown[]) => unknown) => {
      // Store all handlers in a map for tests to access
      Max.handlers.set(message, handler);

      if (message === "mcp_response") {
        Max.mcpResponseHandler = handler as McpResponseHandler;

        // Save the first handler registered (from createExpressApp) as the default
        Max.defaultMcpResponseHandler ??= handler as McpResponseHandler;
      }
    },
  );

  static outlet = vi.fn(
    (
      message: string,
      requestId: string,
      _tool: string,
      _argsJSON: string,
    ): Promise<void> => {
      if (message === "mcp_request" && Max.mcpResponseHandler) {
        const handler = Max.mcpResponseHandler;

        // Defer calling the handler, otherwise the code inside the Promise returned by callLiveApi() hasn't executed yet
        // and the pendingRequests map won't be in the correct state for the handler to work properly.
        setTimeout(() => {
          // TODO: Make a way for these mock responses from v8 to be customized on a per-test basis
          handler(
            requestId,
            JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
          );
        }, 1);
      }

      return Promise.resolve();
    },
  );
}
// eslint-disable-next-line vitest/prefer-import-in-mock -- max-api is an external module with strict types that would require comprehensive mock
vi.mock("max-api", () => ({ default: Max }));

// Export Max so tests can access Max.defaultMcpResponseHandler if needed
g.Max = Max;

beforeEach(() => {
  // Restore the default handler if it was saved
  if (Max.defaultMcpResponseHandler) {
    Max.mcpResponseHandler = Max.defaultMcpResponseHandler;
  }

  // Clear mock folder structure
  clearMockFolderStructure();

  // Clear registered mock objects before setting up defaults
  clearMockRegistry();

  // default mocking behaviors:
  mockLiveApiGet();

  // Set up default mock implementations for id, path, and type getters
  // Return undefined to fall back to instance properties (_id, _path) and auto-detection
  liveApiId.mockImplementation(() => {});
  liveApiPath.mockImplementation(() => {});
  liveApiType.mockImplementation(() => {});

  liveApiCall.mockImplementation(function (method: string) {
    switch (method) {
      case "get_version_string":
        return "12.3";
      case "get_notes_extended":
        return JSON.stringify({ notes: [] });
      default:
        return null;
    }
  });
});
