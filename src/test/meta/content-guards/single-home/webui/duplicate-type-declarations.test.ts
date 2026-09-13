// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Three field lists were typed out twice each: the conversation's locked
// settings (also as ActiveMeta, and again active-prefixed for the sync hook),
// the props every mode's app takes, and the retry call's arguments. Each is
// declared once now and the others derive from it.
describe("webui types have one home", () => {
  it("declares the conversation's locked settings once", () => {
    expect(
      filesContaining("webui/src", /systemInstruction: string \| null;/),
      "extend ConversationLockedSettings instead of re-listing its fields",
    ).toStrictEqual(["webui/src/lib/conversations/conversation-store.ts"]);
  });

  it("maps the active-prefixed mirror rather than re-listing it", () => {
    expect(
      filesContaining(
        "webui/src/hooks",
        /keyof ConversationLockedSettings as `active/,
      ),
      "derive the active-prefixed names from ConversationLockedSettings",
    ).toStrictEqual(["webui/src/hooks/chat/helpers/use-sync-active-meta.ts"]);
  });

  it("derives both mode-state param lists from ModeAppProps", () => {
    expect(
      filesContaining("webui/src/hooks", /ModeAppProps/),
      "pick or omit from ModeAppProps instead of re-listing its fields",
    ).toStrictEqual([
      "webui/src/hooks/chat/use-chat-mode-state.ts",
      "webui/src/hooks/voice/use-voice-mode-state.ts",
    ]);
  });

  it("declares the retry call's arguments once", () => {
    expect(
      filesContaining("webui/src", /resumeStream: \(\) => AsyncIterable/),
      "import ExecuteWithRetryArgs instead of inlining it",
    ).toStrictEqual(["webui/src/hooks/chat/helpers/use-execute-with-retry.ts"]);
  });
});
