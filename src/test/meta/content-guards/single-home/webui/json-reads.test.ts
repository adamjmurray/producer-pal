// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Several hooks each wrote their own abortable, uncached GET. fetchJson throws
// and fetchJsonOrNull swallows — two named helpers rather than one with a flag,
// because whether a failed read is worth showing is the caller's decision.
// Either option order: the reads that moved here were written both ways.
const ABORTABLE_READ =
  /cache: "no-store",[\s\S]{0,60}signal|signal[^}]{0,60},\s*cache: "no-store"/;

const HOME = "webui/src/utils/fetch-json.ts";

describe("abortable JSON reads have one home", () => {
  it("sends an abortable uncached GET from fetch-json.ts only", () => {
    expect(
      filesContaining("webui/src", ABORTABLE_READ),
      "call fetchJson or fetchJsonOrNull",
    ).toStrictEqual([HOME]);
  });
});
