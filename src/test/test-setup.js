import { beforeEach, vi } from "vitest";
import "./expect-extensions.js";
import { Folder, clearMockFolderStructure } from "./mocks/mock-folder.js";
import {
  LiveAPI,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "./mocks/mock-live-api.js";
import { Task } from "./mocks/mock-task.js";

const g = /** @type {any} */ (globalThis);

g.LiveAPI = LiveAPI;
g.Folder = Folder;
await import("#src/live-api-adapter/live-api-extensions.js");

g.Task = Task;
g.outlet = vi.fn();

/** @typedef {(requestId: string, response: string) => void} McpResponseHandler */

class Max {
  static post = vi.fn();

  static POST_LEVELS = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
  };

  /** @type {McpResponseHandler | null} */
  static mcpResponseHandler = null;
  /** @type {McpResponseHandler | null} */
  static defaultMcpResponseHandler = null; // Store the default handler
  /** @type {Map<string, Function>} */
  static handlers = new Map(); // Store all handlers

  static addHandler = vi.fn(
    (/** @type {string} */ message, /** @type {Function} */ handler) => {
      // Store all handlers in a map for tests to access
      Max.handlers.set(message, handler);

      if (message === "mcp_response") {
        Max.mcpResponseHandler = /** @type {McpResponseHandler} */ (handler);

        // Save the first handler registered (from createExpressApp) as the default
        if (!Max.defaultMcpResponseHandler && handler) {
          Max.defaultMcpResponseHandler = /** @type {McpResponseHandler} */ (
            handler
          );
        }
      }
    },
  );

  static outlet = vi.fn(
    (
      /** @type {string} */ message,
      /** @type {string} */ requestId,
      /** @type {string} */ _tool,
      /** @type {string} */ _argsJSON,
    ) => {
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
    },
  );
}
vi.mock(import("max-api"), () => /** @type {*} */ ({ default: Max }));

// Export Max so tests can access Max.defaultMcpResponseHandler if needed
g.Max = Max;

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

  liveApiCall.mockImplementation(function (/** @type {string} */ method) {
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
