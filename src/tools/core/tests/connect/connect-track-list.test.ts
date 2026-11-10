// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { setupConnectMocks } from "./connect-test-helpers.ts";
import { connect } from "../../connect.ts";

function names(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

describe("connect track lists", () => {
  it("lists regular tracks as path and name", () => {
    // Live returns an all-digit name as a number
    setupConnectMocks({ trackNames: ["Drums", "Bass", 5678] });

    const { liveSet } = connect();

    expect(liveSet.tracks).toStrictEqual([
      { path: "t0", name: "Drums" },
      { path: "t1", name: "Bass" },
      { path: "t2", name: "5678" },
    ]);
    expect(liveSet.regularTrackCount).toBe(3);
  });

  it("lists return tracks as path and name", () => {
    setupConnectMocks({ returnTrackNames: ["A-Delay", "B-Reverb"] });

    const { liveSet } = connect();

    expect(liveSet.returnTracks).toStrictEqual([
      { path: "rt0", name: "A-Delay" },
      { path: "rt1", name: "B-Reverb" },
    ]);
    expect(liveSet.returnTrackCount).toBe(2);
  });

  it("leaves out a list with no tracks", () => {
    setupConnectMocks({ trackNames: ["Drums"] });

    const { liveSet } = connect();

    expect(liveSet).not.toHaveProperty("returnTracks");
    expect(liveSet.returnTrackCount).toBe(0);
  });

  it("leaves out both lists in an empty Live Set", () => {
    setupConnectMocks();

    const { liveSet } = connect();

    expect(liveSet).not.toHaveProperty("tracks");
    expect(liveSet).not.toHaveProperty("returnTracks");
  });

  it("lists up to 256 tracks", () => {
    setupConnectMocks({ trackNames: names("T", 256) });

    const { liveSet } = connect();

    expect(liveSet.tracks).toHaveLength(256);
    expect(liveSet.tracks?.[255]).toStrictEqual({ path: "t255", name: "T255" });
  });

  it("leaves out a list over 256 tracks but keeps the count", () => {
    setupConnectMocks({
      trackNames: names("T", 257),
      returnTrackNames: ["A-Delay"],
    });

    const { liveSet } = connect();

    expect(liveSet).not.toHaveProperty("tracks");
    expect(liveSet.regularTrackCount).toBe(257);
    expect(liveSet.returnTracks).toStrictEqual([
      { path: "rt0", name: "A-Delay" },
    ]);
  });

  it("lists up to 256 return tracks", () => {
    setupConnectMocks({ returnTrackNames: names("R", 256) });

    expect(connect().liveSet.returnTracks).toHaveLength(256);
  });

  it("leaves out a return track list over 256 tracks but keeps the count", () => {
    setupConnectMocks({ returnTrackNames: names("R", 257) });

    const { liveSet } = connect();

    expect(liveSet).not.toHaveProperty("returnTracks");
    expect(liveSet.returnTrackCount).toBe(257);
  });
});
