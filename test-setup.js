import { beforeEach, vi } from "vitest";
import { LiveAPI, liveApiId, liveApiGet, liveApiSet, liveApiCall, mockLiveApiGet } from "./device/mock-live-api";

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

  vi.stubGlobal("LiveAPI", LiveAPI);
});
