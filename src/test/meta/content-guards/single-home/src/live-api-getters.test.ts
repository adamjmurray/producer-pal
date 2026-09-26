// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Eight getters each opened with the same hasOwnProperty check before
// defineProperty. defineGetter does that once; a raw defineProperty on the
// prototype anywhere else is the ninth copy.
const PROTOTYPE_GETTER = /Object\.defineProperty\(LiveAPI\.prototype/;

const HOME = "src/live-api-adapter/live-api-extensions.ts";

describe("LiveAPI prototype getters have one home", () => {
  it("registers them through defineGetter only", () => {
    expect(
      filesContaining("src", PROTOTYPE_GETTER),
      "register the getter with defineGetter in live-api-extensions.ts",
    ).toStrictEqual([HOME]);
  });
});
