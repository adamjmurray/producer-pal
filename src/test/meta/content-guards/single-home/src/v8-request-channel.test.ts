// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// node_request and code_exec each kept their own pending map, id counter and
// timeout. Both run on requestChannel now; a second pending map is a second
// copy of the rails, and warning capture has to be suspended in exactly one
// place for the suspend/resume bookkeeping to stay honest.
const PENDING_RAILS = /for unknown request: |new Map<string, Pending>/;

const HOME = "src/live-api-adapter/request-channel.ts";

describe("the V8 request rails have one home", () => {
  it("holds pending Node requests in requestChannel only", () => {
    expect(
      filesContaining("src", PENDING_RAILS),
      "build the protocol on requestChannel instead of its own pending map",
    ).toStrictEqual([HOME]);
  });
});
