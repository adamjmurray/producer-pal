// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  spelledAs,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";

describe("unreachedDetail", () => {
  it("says the request ran out of time", () => {
    expect(unreachedDetail("clip")).toBe(
      "the request ran out of time; re-run for this clip",
    );
  });

  it("leads with what wasn't done when given", () => {
    expect(unreachedDetail("clip", "not created")).toBe(
      "not created: the request ran out of time; re-run for this clip",
    );
  });
});

describe("spelledAs", () => {
  it("spells an id target as an id and anything else in quotes", () => {
    expect(spelledAs({ param: "id", value: "12" })).toBe("id 12");
    expect(spelledAs({ param: "path", value: "t0" })).toBe('"t0"');
  });
});
