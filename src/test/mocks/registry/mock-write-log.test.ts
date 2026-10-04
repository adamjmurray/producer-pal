// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LiveAPI } from "../mock-live-api.ts";
import { registerMockObject } from "../mock-registry.ts";
import { clearMockWrites, getMockWrites } from "./mock-write-log.ts";

describe("mock write log", () => {
  it("records sets and calls in order, on an unregistered object", () => {
    const api = LiveAPI.from(livePath.track(3));

    api.set("name", "Drums");
    api.call("stop_all_clips");

    expect(getMockWrites()).toStrictEqual([
      {
        kind: "set",
        id: "live_set/tracks/3",
        path: "live_set tracks 3",
        name: "name",
        args: ["Drums"],
      },
      {
        kind: "call",
        id: "live_set/tracks/3",
        path: "live_set tracks 3",
        name: "stop_all_clips",
        args: [],
      },
    ]);
  });

  it("records writes to a registered object and keeps order across objects", () => {
    registerMockObject("t1", { path: livePath.track(0) });
    registerMockObject("t2", { path: livePath.track(1) });

    LiveAPI.from(livePath.track(1)).set("mute", 1);
    LiveAPI.from("id t1").call("delete_device", 2);

    expect(
      getMockWrites().map(({ id, name, args }) => [id, name, args]),
    ).toStrictEqual([
      ["t2", "mute", [1]],
      ["t1", "delete_device", [2]],
    ]);
  });

  it("still records after a test replaces the implementation", () => {
    const mock = registerMockObject("t1", { path: livePath.track(0) });

    mock.set.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => LiveAPI.from("id t1").set("mute", 1)).toThrow("boom");
    expect(getMockWrites()).toHaveLength(1);
  });

  it("keeps the registration's own spy working", () => {
    const mock = registerMockObject("t1", { path: livePath.track(0) });

    LiveAPI.from("id t1").set("mute", 1);

    expect(mock.set).toHaveBeenCalledWith("mute", 1);
  });

  it("does not record reads", () => {
    registerMockObject("t1", { path: livePath.track(0) });

    LiveAPI.from("id t1").get("name");

    expect(getMockWrites()).toStrictEqual([]);
  });

  it("empties on clear", () => {
    LiveAPI.from(livePath.track(0)).set("mute", 1);
    clearMockWrites();

    expect(getMockWrites()).toStrictEqual([]);
  });
});
