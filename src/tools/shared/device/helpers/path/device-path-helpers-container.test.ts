// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { insertionContainerPath } from "./device-path-helpers.ts";

describe("insertionContainerPath", () => {
  it.each([
    ["t0", "t0"],
    ["t0/d3", "t0"],
    ["mt/d0/c1", "mt/d0/c1"],
    ["rt0/d0/c1/d2", "rt0/d0/c1"],
    // The pad spelling survives verbatim: it is what a result echoes back.
    ["t0/d0/pC1/c1", "t0/d0/pC1/c1"],
    ["t0/d0/pC1/c1/d2", "t0/d0/pC1/c1"],
  ])("names the container %s addresses", (path, expected) => {
    expect(insertionContainerPath(path)).toBe(expected);
  });

  // Never throws — it only names something a completed operation already has —
  // but a path it can't parse still has to come back as a container, not with
  // the object's own position left on the end.
  it("trims a path it can't parse rather than throwing", () => {
    expect(insertionContainerPath("r0/d0")).toBe("r0");
  });
});
