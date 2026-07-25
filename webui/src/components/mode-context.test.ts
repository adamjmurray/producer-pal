// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEFAULT_MODE_CONTEXT, noop } from "#webui/components/mode-context";

describe("DEFAULT_MODE_CONTEXT", () => {
  it("provides a null conversation lock until a mode reports its context", () => {
    expect(DEFAULT_MODE_CONTEXT.conversationLock).toStrictEqual({
      activeModel: null,
      activeProvider: null,
      activeSmallModelMode: null,
      activeNotation: null,
    });
  });

  it("wires delete handlers to a noop placeholder that returns undefined", () => {
    expect(DEFAULT_MODE_CONTEXT.onDeleteAllConversations()).toBeUndefined();
    expect(
      DEFAULT_MODE_CONTEXT.onDeleteUnbookmarkedConversations(),
    ).toBeUndefined();
    expect(noop()).toBeUndefined();
  });
});
