// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// A device copy and a chain copy each wrote the same preamble: split toPath,
// claim the call's names, take the source id, fan out. Claiming the names is
// what that preamble does, so a second one means a second copy.
const CLAIM_PREAMBLE = /claimLabels\(labels, Math\.max\(paths\.length, 1\)\)/;

const HOME =
  "src/tools/actions/duplicate/helpers/device/copy-per-destination.ts";

describe("the device copy fan-out has one home", () => {
  it("claims the names for a device or chain copy in copyToDestinations only", () => {
    expect(
      filesContaining("src/tools", CLAIM_PREAMBLE),
      "call copyToDestinations instead of rebuilding the preamble",
    ).toStrictEqual([HOME]);
  });
});
