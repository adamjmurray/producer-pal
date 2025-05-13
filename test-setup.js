import { afterEach, beforeEach, vi } from "vitest";
import { LiveAPI, liveApiCall, liveApiId, mockLiveApiGet } from "./device/mock-live-api";
import { Task } from "./device/mock-task";

globalThis.LiveAPI = LiveAPI;
require("./device/live-api-extensions");

globalThis.Task = Task;

beforeEach(() => {
  vi.resetAllMocks();

  // default mocking behaviors:
  liveApiId.mockReturnValue("1");
  mockLiveApiGet();
  liveApiCall.mockImplementation((method) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({
        notes: [],
      });
    }
    return null;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
