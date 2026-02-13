// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi, type Mock } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mocks/mock-live-api.ts";

type MockLiveAPIInstance = {
  _path?: string;
  _id?: string;
  path?: string | null;
  id?: string | null;
  exists: Mock;
  set: Mock;
  call: Mock;
  get: Mock;
  getProperty: Mock;
  setProperty: Mock;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  category?: string | null;
  sceneIndex?: number | null;
  type?: string;
};

type MockLiveAPIConstructor = Mock<(path?: string) => MockLiveAPIInstance> & {
  from: Mock;
  mockImplementation: Mock["mockImplementation"];
};

interface MockAppView {
  call: Mock;
  _id: string;
  _path: string;
}

interface MockSongView {
  set: Mock;
  call: Mock;
  _id: string;
  _path: string;
}

interface MockTrackAPI {
  exists: Mock;
  category: string;
  trackIndex: number;
  _id: string;
  _path: string;
}

export interface SelectMocks {
  mockAppView: MockAppView;
  mockSongView: MockSongView;
  mockTrackAPI: MockTrackAPI;
}

const LIVE_APP_VIEW_PATH = "live_app view";
const LIVE_SET_VIEW_PATH = "live_set view";
const LIVE_SET_VIEW_SELECTED_TRACK_PATH = "live_set view selected_track";

/**
 * Sets up the common mock implementations for legacy select tests.
 * @returns Mock objects
 */
export function setupSelectMocks(): SelectMocks {
  const mockAppView: MockAppView = {
    call: liveApiCall,
    _id: "app_view_id",
    _path: LIVE_APP_VIEW_PATH,
  };

  const mockSongView: MockSongView = {
    set: liveApiSet,
    call: liveApiCall,
    _id: "song_view_id",
    _path: LIVE_SET_VIEW_PATH,
  };

  const mockTrackAPI: MockTrackAPI = {
    exists: vi.fn().mockReturnValue(true),
    category: "regular",
    trackIndex: 1,
    _id: "id track_id_123",
    _path: LIVE_SET_VIEW_SELECTED_TRACK_PATH,
  };

  liveApiId.mockImplementation(function (this: { _id?: string }) {
    return this._id ?? "id default";
  });
  liveApiGet.mockReturnValue(["id", "device_123", "id", "device_456"]);

  const MockLiveAPI = getGlobalLiveAPI();

  MockLiveAPI.mockImplementation(function (
    this: Record<string, unknown>,
    path: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed for mock context
    const self = this;

    self.path = path;
    self._path = path;
    self.exists = vi.fn().mockReturnValue(true);
    self.set = liveApiSet;
    self.call = liveApiCall;
    self.get = liveApiGet;
    self.getProperty = vi.fn();
    self.setProperty = vi.fn((property: string, value: unknown) =>
      liveApiSet(property, value),
    );

    if (path === LIVE_APP_VIEW_PATH) {
      Object.assign(self, mockAppView);
      (self.getProperty as Mock).mockReturnValue(1);
      (self.call as Mock).mockReturnValue(0);
    } else if (path === LIVE_SET_VIEW_PATH) {
      Object.assign(self, mockSongView);
    } else if (path === LIVE_SET_VIEW_SELECTED_TRACK_PATH) {
      Object.assign(self, mockTrackAPI);
      (self.exists as Mock).mockReturnValue(false);
      self.trackIndex = null;
      self.returnTrackIndex = null;
      self.category = null;
      self.id = null;
      self.path = null;
    } else if (path === "live_set view selected_scene") {
      (self.exists as Mock).mockReturnValue(false);
      self.sceneIndex = null;
      self.id = null;
    } else if (path === "live_set view detail_clip") {
      (self.exists as Mock).mockReturnValue(false);
      self.id = null;
    } else if (path === "live_set view highlighted_clip_slot") {
      (self.exists as Mock).mockReturnValue(false);
      self.trackIndex = null;
      self.sceneIndex = null;
    } else if (path.includes("clip_slots")) {
      self._id = "id clipslot_id_789";
    } else if (
      path.startsWith("live_set tracks") ||
      path.startsWith("live_set return_tracks") ||
      path.startsWith("live_set master_track")
    ) {
      self._id = "id track_id_123";
    } else if (path.startsWith("live_set scenes")) {
      self._id = "id scene_id_456";
    } else if (path.includes(" view") && path.includes("tracks")) {
      (self.get as Mock).mockReturnValue(null);
    }

    Object.defineProperty(self, "id", {
      get: function (this: { _id?: string }) {
        return liveApiId.apply(this);
      },
    });

    Object.defineProperty(self, "type", {
      get: function (this: { _path?: string }) {
        return liveApiType.apply(this);
      },
    });

    return self;
  });

  MockLiveAPI.from = vi.fn((idOrPath: string | number) => {
    let path = idOrPath;

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      path = `id ${idOrPath}`;
    }

    const instance = new (MockLiveAPI as unknown as new (
      p: string,
    ) => Record<string, unknown>)(path as string);

    if (typeof path === "string" && path.startsWith("id ")) {
      instance._id = path;
    }

    return instance;
  });

  return { mockAppView, mockSongView, mockTrackAPI };
}

function getGlobalLiveAPI(): MockLiveAPIConstructor {
  return (globalThis as unknown as { LiveAPI: MockLiveAPIConstructor }).LiveAPI;
}
