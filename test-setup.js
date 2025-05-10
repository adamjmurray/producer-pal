import { beforeEach, vi } from "vitest";
import { LiveAPI, liveApiId, liveApiCall, liveApiGet, mockLiveApiGet } from "./device/mock-live-api";

beforeEach(() => {
  liveApiId.mockReset();
  liveApiCall.mockReset();
  liveApiGet.mockReset();

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

  vi.stubGlobal("LiveAPI", LiveAPI);
});
