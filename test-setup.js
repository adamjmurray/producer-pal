// test-setup.js
import { beforeEach, vi } from "vitest";
import "./src/expect-extensions";
import { LiveAPI, liveApiCall, mockLiveApiGet } from "./src/mock-live-api";
import { Task } from "./src/mock-task";

globalThis.LiveAPI = LiveAPI;
await import("./src/live-api-extensions");

globalThis.Task = Task;
globalThis.outlet = vi.fn();

beforeEach(() => {
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
