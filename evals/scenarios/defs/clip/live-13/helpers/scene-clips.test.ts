// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { sceneClipsProblem } from "./scene-clips.ts";

const WANTED = [
  { path: "t0/s0", name: "Step Sequencer" },
  { path: "rt0/s0", name: "No Envs" },
];

describe("sceneClipsProblem", () => {
  it("accepts the same clips in any order", () => {
    expect(
      sceneClipsProblem({ clips: WANTED.toReversed() }, WANTED),
    ).toBeNull();
  });

  it("names a missing return-track clip", () => {
    expect(sceneClipsProblem({ clips: [WANTED[0]] }, WANTED)).toBe(
      'scene holds t0/s0 "Step Sequencer", wanted rt0/s0 "No Envs", t0/s0 "Step Sequencer"',
    );
  });

  it("names an extra clip", () => {
    expect(
      sceneClipsProblem({ clips: [{ path: "t0/s1", name: "Notes" }] }, []),
    ).toBe('scene holds t0/s1 "Notes", wanted none');
  });

  it("reads a result with no clips as none", () => {
    expect(sceneClipsProblem({}, [])).toBeNull();
  });
});
