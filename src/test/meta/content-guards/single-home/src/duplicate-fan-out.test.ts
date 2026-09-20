// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// A device copy and a chain copy each wrote the same preamble: split toPath,
// claim the call's names, refuse a count, take the source id, fan out. The
// count warning is what that preamble says, so a second one means a second copy.
const COUNT_WARNING = /copies go one per toPath/;

const HOME =
  "src/tools/actions/duplicate/helpers/device/copy-per-destination.ts";

describe("the device copy fan-out has one home", () => {
  it("warns about an ignored count from copyToDestinations only", () => {
    expect(
      filesContaining("src/tools", COUNT_WARNING),
      "call copyToDestinations instead of rebuilding the preamble",
    ).toStrictEqual([HOME]);
  });
});
