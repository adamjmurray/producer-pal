// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type LiveChange } from "#src/shared/gen-ui-types";
import { changeAffectsClip } from "#webui/lib/utils/gen-ui/change-affects-clip";

const change = (overrides: Partial<LiveChange>): LiveChange => ({
  tool: "ppal-update-clip",
  ids: [],
  paths: [],
  all: false,
  ...overrides,
});

describe("changeAffectsClip", () => {
  it("matches the widget's own ref", () => {
    expect(changeAffectsClip(change({ ids: ["12"] }), "12")).toBe(true);
    expect(changeAffectsClip(change({ paths: ["t0/s3"] }), "t0/s3")).toBe(true);
  });

  it("matches the id or path the last read found", () => {
    const lastRead = { id: "12", path: "t0/s3" };

    // A path widget, changed by id.
    expect(changeAffectsClip(change({ ids: ["12"] }), "t0/s3", lastRead)).toBe(
      true,
    );
    // An id widget, changed by path.
    expect(
      changeAffectsClip(change({ paths: ["t0/s3"] }), "12", lastRead),
    ).toBe(true);
  });

  it("ignores changes to other objects", () => {
    expect(
      changeAffectsClip(change({ ids: ["99"], paths: ["t5/s5"] }), "12", {
        id: "12",
        path: "t0/s3",
      }),
    ).toBe(false);
  });

  it("always matches when anything may have changed", () => {
    expect(changeAffectsClip(change({ all: true }), "12")).toBe(true);
  });
});
