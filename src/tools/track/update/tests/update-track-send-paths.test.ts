// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateTrack - return tracks named by path", () => {
  let send1: RegisteredMockObject;
  let send2: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
      properties: { sends: children("send_1", "send_2") },
    });
    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return_A", "return_B") },
    });
    registerMockObject("return_A", {
      path: livePath.returnTrack(0),
      properties: { name: "A-Reverb" },
    });
    registerMockObject("return_B", {
      path: livePath.returnTrack(1),
      properties: { name: "B-Delay" },
    });
    send1 = registerMockObject("send_1", {});
    send2 = registerMockObject("send_2", {});
  });

  it("takes rt<n> as sendReturn", () => {
    updateTrack({ id: "123", sendGainDb: -6, sendReturn: "rt1" });

    expect(send2.set).toHaveBeenCalledWith("display_value", -6);
    expect(send1.set).not.toHaveBeenCalled();
  });

  it("takes rt<n> as sends[].return", () => {
    updateTrack({
      id: "123",
      sends: [
        { return: "rt0", gainDb: -3 },
        { return: "rt1", gainDb: -9 },
      ],
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -3);
    expect(send2.set).toHaveBeenCalledWith("display_value", -9);
  });

  it("fails a path past the last return the way an unknown name does", () => {
    const message =
      'no send landed — "rt9": no return track matching "rt9" (Available: A-Reverb, B-Delay)';

    expect(() =>
      updateTrack({ id: "123", sendGainDb: -6, sendReturn: "rt9" }),
    ).toThrow(message);
  });

  it("lets a return named like a path keep that name", () => {
    registerMockObject("return_B", {
      path: livePath.returnTrack(1),
      properties: { name: "rt0" },
    });

    updateTrack({ id: "123", sendGainDb: -6, sendReturn: "rt0" });

    expect(send2.set).toHaveBeenCalledWith("display_value", -6);
    expect(send1.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("using the name"),
    ]);
  });
});
