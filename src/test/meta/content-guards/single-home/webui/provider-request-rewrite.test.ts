// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// The Anthropic and OpenRouter providers each wrapped fetch to rewrite the
// outgoing body, with the same parse / mutate / re-serialize dance around
// their own edits. rewritingFetch is that dance.
const BODY_REWRITE = /JSON\.parse\(init\.body\)/;

const HOME = "webui/src/chat/sdk/provider-factories.ts";

describe("provider request rewriting has one home", () => {
  it("re-parses an outgoing body in rewritingFetch only", () => {
    expect(
      filesContaining("webui/src", BODY_REWRITE),
      "build the provider's fetch with rewritingFetch",
    ).toStrictEqual([HOME]);
  });
});
