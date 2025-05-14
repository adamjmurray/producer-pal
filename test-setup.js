import { afterEach, beforeEach, vi } from "vitest";
import { LiveAPI, liveApiCall, mockLiveApiGet } from "./device/mock-live-api";
import { Task } from "./device/mock-task";

globalThis.LiveAPI = LiveAPI;
require("./device/live-api-extensions");

globalThis.Task = Task;

beforeEach(() => {
  vi.resetAllMocks();

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

afterEach(() => {
  vi.restoreAllMocks();
});
