// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "./update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateTrack - send properties", () => {
  let track123: MockObjectHandle;
  let send1: MockObjectHandle;
  let send2: MockObjectHandle;
  let send3: MockObjectHandle;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: "live_set tracks 0" });
    registerMockObject("456", { path: "live_set tracks 1" });

    registerMockObject("mixer_1", {
      path: "live_set tracks 0 mixer_device",
      properties: { sends: children("send_1", "send_2") },
    });
    registerMockObject("mixer_2", {
      path: "live_set tracks 1 mixer_device",
      properties: { sends: children("send_3", "send_4") },
    });

    registerMockObject("liveSet", {
      path: "live_set",
      properties: { return_tracks: children("return_A", "return_B") },
    });
    registerMockObject("return_A", {
      path: "live_set return_tracks 0",
      properties: { name: "A-Reverb" },
    });
    registerMockObject("return_B", {
      path: "live_set return_tracks 1",
      properties: { name: "B-Delay" },
    });

    send1 = registerMockObject("send_1", {});
    send2 = registerMockObject("send_2", {});
    send3 = registerMockObject("send_3", {});
    registerMockObject("send_4", {});
  });

  it("should set send gain with exact return name", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A-Reverb",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("should set send gain with letter prefix", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should set second send with letter prefix", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -3,
      sendReturn: "B",
    });

    expect(send2.set).toHaveBeenCalledWith("display_value", -3);
  });

  it("should set send gain to minimum value", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -70,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -70);
  });

  it("should set send gain to maximum value (0 dB)", () => {
    updateTrack({
      ids: "123",
      sendGainDb: 0,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", 0);
  });

  it("should warn and skip when only sendGainDb is provided", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when only sendReturn is provided", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when return track not found", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "C",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when track has no sends", () => {
    // Override mixer_1 with empty sends for this test
    registerMockObject("mixer_1", {
      path: "live_set tracks 0 mixer_device",
      properties: { sends: [] },
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set sends on multiple tracks", () => {
    updateTrack({
      ids: "123,456",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
    expect(send3.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should combine send update with other properties", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
      sendGainDb: -12,
      sendReturn: "B",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Test Track");
    expect(send2.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("should not set send when neither param is provided", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
    });

    // Should only set name, not any send values
    expect(send1.set).not.toHaveBeenCalled();
    expect(send2.set).not.toHaveBeenCalled();
  });

  it("should warn and skip when mixer device does not exist", () => {
    // Override mixer to be non-existent for this test
    registerMockObject("id 0", {
      path: "live_set tracks 0 mixer_device",
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when send index exceeds available sends", () => {
    // Setup: 3 return tracks but only 2 sends
    registerMockObject("liveSet", {
      path: "live_set",
      properties: {
        return_tracks: children("return_A", "return_B", "return_C"),
      },
    });
    registerMockObject("return_C", {
      path: "live_set return_tracks 2",
      properties: { name: "C-Echo" },
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "C", // Matches return track at index 2
    });

    expect(result).toStrictEqual({ id: "123" });
  });
});
