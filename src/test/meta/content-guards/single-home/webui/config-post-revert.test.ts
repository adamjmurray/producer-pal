// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Each config setter showed its new value, took a sequence number, claimed
// ownership and posted — three copies of bookkeeping that decides whether a
// failed POST is allowed to revert. postField does it once.
const CLAIMS_OWNERSHIP = /latestConfigSeqRef\.current = seq/;

const HOME = "webui/src/hooks/connection/use-remote-config.ts";

describe("the optimistic config POST has one home", () => {
  it("claims sequence ownership in use-remote-config.ts only", () => {
    expect(
      filesContaining("webui/src", CLAIMS_OWNERSHIP),
      "post through postField so one place owns the sequence bookkeeping",
    ).toStrictEqual([HOME]);
  });
});
