import { beforeEach, vi } from "vitest";
import "./expect-extensions.js";
import { Folder, clearMockFolderStructure } from "./mock-folder.js";
import {
  LiveAPI,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "./mock-live-api.js";
import { Task } from "./mock-task.js";

globalThis.LiveAPI = LiveAPI;
globalThis.Folder = Folder;
await import("#src/live-api-adapter/live-api-extensions.js");

globalThis.Task = Task;
globalThis.outlet = vi.fn();

class Max {
  static post = vi.fn();

  static POST_LEVELS = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
  };

  static mcpResponseHandler = null;
  static defaultMcpResponseHandler = null; // Store the default handler
  static handlers = new Map(); // Store all handlers

  static addHandler = vi.fn((message, handler) => {
    // Store all handlers in a map for tests to access
    Max.handlers.set(message, handler);

    if (message === "mcp_response") {
      Max.mcpResponseHandler = handler;

      // Save the first handler registered (from createExpressApp) as the default
      if (!Max.defaultMcpResponseHandler && handler) {
        Max.defaultMcpResponseHandler = handler;
      }
    }
  });

  static outlet = vi.fn((message, requestId, _tool, _argsJSON) => {
    if (message === "mcp_request" && Max.mcpResponseHandler) {
      // Defer calling the handler, otherwise the code inside the Promise returned by callLiveApi() hasn't executed yet
      // and the pendingRequests map won't be in the correct state for the handler to work properly.
      setTimeout(() => {
        // TODO: Make a way for these mock responses from v8 to be customized on a per-test basis
        Max.mcpResponseHandler(
          requestId,
          JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
        );
      }, 1);
    }
  });
}
vi.mock(import("max-api"), () => ({ default: Max }));

// Export Max so tests can access Max.defaultMcpResponseHandler if needed
globalThis.Max = Max;

beforeEach(() => {
  // Restore the default handler if it was saved
  if (Max.defaultMcpResponseHandler) {
    Max.mcpResponseHandler = Max.defaultMcpResponseHandler;
  }

  // Clear mock folder structure
  clearMockFolderStructure();

  // default mocking behaviors:
  mockLiveApiGet();

  // Set up default mock implementations for id, path, and type getters
  // Return undefined to fall back to instance properties (_id, _path) and auto-detection
  liveApiId.mockImplementation(() => {});
  liveApiPath.mockImplementation(() => {});
  liveApiType.mockImplementation(() => {});

  liveApiCall.mockImplementation(function (method) {
    switch (method) {
      case "get_version_string":
        return "12.2";
      case "get_notes_extended":
        return JSON.stringify({ notes: [] });
      default:
        return null;
    }
  });
});
