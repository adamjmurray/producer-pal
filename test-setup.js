import { vi, beforeEach, afterEach } from "vitest";
import { LiveAPI, liveApiId, liveApiGet, liveApiSet, liveApiCall, mockLiveApiGet } from "./device/mock-live-api";

globalThis.LiveAPI = LiveAPI;
require("./device/live-api-extensions");

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
