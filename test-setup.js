// test-setup.js
import { beforeEach, vi } from "vitest";
import "./src/expect-extensions";
import { LiveAPI, liveApiCall, mockLiveApiGet } from "./src/mock-live-api";
import { Task } from "./src/mock-task";

globalThis.LiveAPI = LiveAPI;
await import("./src/live-api-extensions");

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

  static addHandler = vi.fn((message, handler) => {
    if (message === "mcp_response") {
      Max.mcpResponseHandler = handler;
      // Save the first handler registered (from createExpressApp) as the default
      if (!Max.defaultMcpResponseHandler && handler) {
        Max.defaultMcpResponseHandler = handler;
      }
    }
  });

  static outlet = vi.fn((message, jsonString) => {
    if (message === "mcp_request" && Max.mcpResponseHandler) {
      const data = JSON.parse(jsonString);
      // Defer calling the handler, otherwise the code inside the Promise returned by callLiveApi() hasn't executed yet
      // and the pendingRequests map won't be in the correct state for the handler to work properly.
      setTimeout(() => {
        // TODO: Make a way for these mock responses from v8 to be customized on a per-test basis
        Max.mcpResponseHandler(
          JSON.stringify({
            requestId: data.requestId,
            result: { content: [{ type: "text", text: "{}" }] },
          }),
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

  // default mocking behaviors:
  mockLiveApiGet();
  // TODO: this should move into mockLiveApiCall (and maybe introduce mockLiveApiId and mockLiveApiPath and eventually wrap the whole thing in mockLiveApi)
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
