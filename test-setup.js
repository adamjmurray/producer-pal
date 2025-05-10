import { beforeEach, vi } from "vitest";
import { LiveAPI, liveApiId, liveApiGet, liveApiSet, liveApiCall, mockLiveApiGet } from "./device/mock-live-api";

globalThis.LiveAPI = LiveAPI;
require("./device/live-api-extensions");

beforeEach(() => {
  liveApiId.mockReset();
  liveApiGet.mockReset();
  liveApiSet.mockReset();
  liveApiCall.mockReset();

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
