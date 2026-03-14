// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("updateDevice - focus functionality", () => {
  const selectMock = setupSelectMock();

  beforeEach(() => {
    mockNonExistentObjects();

    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "Device",
    });
  });

  it("should select device and show device detail when focus=true", () => {
    updateDevice({ ids: "123", name: "Test", focus: true });

    expect(selectMock.get()).toHaveBeenCalledWith({
      deviceId: "123",
      detailView: "device",
    });
  });

  it("should select last device when focus=true with multiple devices", () => {
    updateDevice({ ids: "123,456", name: "Test", focus: true });

    expect(selectMock.get()).toHaveBeenCalledWith({
      deviceId: "456",
      detailView: "device",
    });
    expect(selectMock.get()).toHaveBeenCalledTimes(1);
  });

  it("should not call select when focus=false", () => {
    updateDevice({ ids: "123", name: "Test", focus: false });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });

  it("should not call select when focus is omitted", () => {
    updateDevice({ ids: "123", name: "Test" });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });
});
