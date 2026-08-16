// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  type ActiveRefs,
  buildConversationSaveRecord,
  buildSaveRecord,
  deriveTitle,
  resolvePanelNotification,
  sumMessageUsage,
} from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import { loadConversation } from "#webui/lib/conversation-db";

vi.mock(import("#webui/lib/conversation-db"), () => ({
  loadConversation: vi.fn(),
}));

/**
 * Build active refs with overridable fields for the record builders.
 * @param over - Fields to override on the defaults
 * @returns Active refs
 */
function refs(over: Partial<ActiveRefs> = {}): ActiveRefs {
  return {
    id: "conv-1",
    title: null,
    createdAt: null,
    bookmarked: false,
    model: null,
    provider: null,
    notation: null,
    thinking: null,
    smallModelMode: null,
    systemInstruction: null,
    enabledTools: null,
    ...over,
  };
}

const HISTORY = [{ role: "user", content: "hi" }];

describe("deriveTitle", () => {
  it("uses first user message as title", () => {
    const history = [{ role: "user", content: "Write a melody" }];

    expect(deriveTitle(null, history)).toBe("Write a melody");
  });

  it("skips connect command and uses second user message", () => {
    const history = [
      { role: "user", content: "connect to ableton" },
      { role: "assistant", content: "Connected!" },
      { role: "user", content: "Make a beat" },
    ];

    expect(deriveTitle(null, history)).toBe("Make a beat");
  });

  it("keeps manually-set title", () => {
    const history = [{ role: "user", content: "Hello" }];

    expect(deriveTitle("My Custom Title", history)).toBe("My Custom Title");
  });

  it("returns currentTitle when no user messages", () => {
    expect(deriveTitle("Old Title", [])).toBe("Old Title");
  });

  it("tolerates a first user message with no content", () => {
    const history = [{ role: "user" }];

    expect(deriveTitle(null, history)).toBeNull();
  });

  it("keeps the connect line when the second user message has no content", () => {
    const history = [
      { role: "user", content: "connect" },
      { role: "assistant", content: "ok" },
      { role: "user" },
    ];

    // The second user message is empty, so the derived title falls back to the
    // (connect) first line rather than an empty string.
    expect(deriveTitle(null, history)).toBe("connect");
  });
});

describe("buildSaveRecord systemInstruction snapshot", () => {
  it("snapshots the active instruction on a new record", () => {
    const rec = buildSaveRecord(
      refs({ systemInstruction: "PROMPT A" }),
      undefined,
      HISTORY,
    );

    expect(rec.systemInstruction).toBe("PROMPT A");
  });

  it("preserves an existing snapshot over the current instruction", () => {
    const existing = buildSaveRecord(
      refs({ systemInstruction: "OLD" }),
      undefined,
      HISTORY,
    );
    const updated = buildSaveRecord(
      refs({ systemInstruction: "NEW" }),
      existing,
      HISTORY,
    );

    expect(updated.systemInstruction).toBe("OLD");
  });

  it("omits the field when no instruction is known", () => {
    const rec = buildSaveRecord(refs(), undefined, HISTORY);

    expect("systemInstruction" in rec).toBe(false);
  });
});

describe("buildSaveRecord notation snapshot", () => {
  it("snapshots the active notation on a new record", () => {
    const rec = buildSaveRecord(
      refs({ notation: "stark" }),
      undefined,
      HISTORY,
    );

    expect(rec.notation).toBe("stark");
  });

  it("preserves an existing snapshot over the current notation", () => {
    // Restoring this conversation has to keep parsing its notes the way they
    // were written, so a later save can't re-capture whatever the device is on.
    const existing = buildSaveRecord(
      refs({ notation: "stark" }),
      undefined,
      HISTORY,
    );
    const updated = buildSaveRecord(
      refs({ notation: "barbeat" }),
      existing,
      HISTORY,
    );

    expect(updated.notation).toBe("stark");
  });

  it("omits the field when no notation is known", () => {
    const rec = buildSaveRecord(refs(), undefined, HISTORY);

    expect("notation" in rec).toBe(false);
  });
});

describe("buildSaveRecord toolset snapshot", () => {
  it("records the toolset the conversation last connected with", () => {
    const rec = buildSaveRecord(
      refs({ enabledTools: { "ppal-library": false } }),
      undefined,
      HISTORY,
    );

    expect(rec.enabledTools).toStrictEqual({ "ppal-library": false });
  });

  it("re-captures the toolset on later saves", () => {
    // The opposite of the two snapshots above: a restored conversation really
    // does reconnect with the current tools, so the record has to follow rather
    // than freeze what it first ran with.
    const existing = buildSaveRecord(
      refs({ enabledTools: { "ppal-library": false } }),
      undefined,
      HISTORY,
    );
    const updated = buildSaveRecord(
      refs({ enabledTools: { "ppal-library": true } }),
      existing,
      HISTORY,
    );

    expect(updated.enabledTools).toStrictEqual({ "ppal-library": true });
  });

  it("omits the field when no toolset is known", () => {
    const rec = buildSaveRecord(refs(), undefined, HISTORY);

    expect("enabledTools" in rec).toBe(false);
  });
});

describe("buildConversationSaveRecord fork inheritance", () => {
  afterEach(() => {
    vi.mocked(loadConversation).mockReset();
  });

  it("inherits the trunk's snapshot when forking", async () => {
    vi.mocked(loadConversation).mockResolvedValue({
      id: "trunk",
      systemInstruction: "TRUNK SI",
    } as never);

    const rec = await buildConversationSaveRecord({
      id: "fork-1",
      reuseId: "trunk",
      fork: { anchorIndex: 1 },
      refs: refs({ systemInstruction: "CURRENT GLOBAL" }),
      chatHistory: HISTORY,
      updatedAt: undefined,
    });

    expect(rec.systemInstruction).toBe("TRUNK SI");
    expect(rec.forkParentId).toBe("trunk");
  });

  it("inherits the trunk's notation when forking", async () => {
    // The fork carries the trunk's turns, which were written under the trunk's
    // notation — re-capturing the current global would mis-parse them.
    vi.mocked(loadConversation).mockResolvedValue({
      id: "trunk",
      notation: "stark",
    } as never);

    const rec = await buildConversationSaveRecord({
      id: "fork-1",
      reuseId: "trunk",
      fork: { anchorIndex: 1 },
      refs: refs({ notation: "barbeat" }),
      chatHistory: HISTORY,
      updatedAt: undefined,
    });

    expect(rec.notation).toBe("stark");
  });

  it("uses the current instruction when the trunk has no snapshot", async () => {
    vi.mocked(loadConversation).mockResolvedValue({ id: "trunk" } as never);

    const rec = await buildConversationSaveRecord({
      id: "fork-1",
      reuseId: "trunk",
      fork: { anchorIndex: 1 },
      refs: refs({ systemInstruction: "CURRENT GLOBAL" }),
      chatHistory: HISTORY,
      updatedAt: undefined,
    });

    expect(rec.systemInstruction).toBe("CURRENT GLOBAL");
  });

  it("falls back to reuseId as the parent when the source record is gone", async () => {
    // The trunk was deleted between fork signal and save: with no source to
    // derive a parent from, the fork attaches directly to the reuse id.
    vi.mocked(loadConversation).mockResolvedValue(null as never);

    const rec = await buildConversationSaveRecord({
      id: "fork-1",
      reuseId: "trunk",
      fork: { anchorIndex: 2 },
      refs: refs(),
      chatHistory: HISTORY,
      updatedAt: undefined,
    });

    expect(rec.forkParentId).toBe("trunk");
    expect(rec.forkedAtIndex).toBe(2);
  });
});

describe("sumMessageUsage", () => {
  it("returns null for empty history", () => {
    expect(sumMessageUsage([])).toBeNull();
  });

  it("returns null when no messages have usage", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    expect(sumMessageUsage(history)).toBeNull();
  });

  it("sums usage across assistant messages", () => {
    const history = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "hi",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      { role: "user", content: "bye" },
      {
        role: "assistant",
        content: "cya",
        usage: { inputTokens: 200, outputTokens: 30 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 300,
      outputTokens: 50,
    });
  });

  it("skips user messages and assistant messages without usage", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "no usage here" },
      {
        role: "assistant",
        content: "with usage",
        usage: { inputTokens: 50, outputTokens: 10 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 50,
      outputTokens: 10,
    });
  });

  it("sums reasoning tokens when present", () => {
    const history = [
      {
        role: "assistant",
        content: "thinking",
        usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 30 },
      },
      {
        role: "assistant",
        content: "more",
        usage: { inputTokens: 200, outputTokens: 80, reasoningTokens: 60 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 300,
      outputTokens: 130,
      reasoningTokens: 90,
    });
  });

  it("sums cache read tokens when present", () => {
    const history = [
      {
        role: "assistant",
        content: "first",
        usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 9000 },
      },
      {
        role: "assistant",
        content: "second",
        usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 9500 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 18500,
    });
  });

  it("defaults missing input/output token fields to zero", () => {
    // An assistant message with a usage object but no token fields still counts
    // as usage; each missing field falls back to 0.
    const history = [{ role: "assistant", content: "x", usage: {} }];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("omits reasoningTokens when all are zero", () => {
    const history = [
      {
        role: "assistant",
        content: "no thinking",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 100,
      outputTokens: 20,
    });
  });
});

describe("resolvePanelNotification", () => {
  const dismissUndo = vi.fn();
  const dismissLimit = vi.fn();

  /**
   * Build an undo-state stub with the given banner.
   * @param banner - The undo banner, or null when none is pending
   * @returns Undo notification state
   */
  function undoState(banner: TransferNotificationData | null) {
    return { undoNotification: banner, dismissUndoNotification: dismissUndo };
  }

  /**
   * Build a limit-state stub with the given banner.
   * @param banner - The limit/save-error banner, or null when none
   * @returns Limit notification state
   */
  function limitState(banner: TransferNotificationData | null) {
    return {
      limitNotification: banner,
      dismissLimitNotification: dismissLimit,
    };
  }

  const warn: TransferNotificationData = {
    message: "Deleted “x”",
    type: "warning",
  };
  const undoErr: TransferNotificationData = { message: "Retry", type: "error" };
  const limitWarn: TransferNotificationData = {
    message: "limit",
    type: "warning",
  };
  const saveErr: TransferNotificationData = {
    message: "storage full",
    type: "error",
  };

  it("shows the undo banner over a passive limit warning", () => {
    const r = resolvePanelNotification(undoState(warn), limitState(limitWarn));

    expect(r.notification).toBe(warn);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("surfaces a save-error over a stale undo warning banner", () => {
    // The undo banner never auto-expires; a later save error must not hide
    // behind it indefinitely.
    const r = resolvePanelNotification(undoState(warn), limitState(saveErr));

    expect(r.notification).toBe(saveErr);
    expect(r.dismissNotification).toBe(dismissLimit);
  });

  it("keeps the fresher undo banner when both are errors", () => {
    const r = resolvePanelNotification(undoState(undoErr), limitState(saveErr));

    expect(r.notification).toBe(undoErr);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("shows an undo error over a limit warning", () => {
    const r = resolvePanelNotification(
      undoState(undoErr),
      limitState(limitWarn),
    );

    expect(r.notification).toBe(undoErr);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("falls back to the limit banner when no undo is pending", () => {
    const r = resolvePanelNotification(undoState(null), limitState(saveErr));

    expect(r.notification).toBe(saveErr);
    expect(r.dismissNotification).toBe(dismissLimit);
  });

  it("returns null with the limit dismiss handler when neither banner is present", () => {
    const r = resolvePanelNotification(undoState(null), limitState(null));

    expect(r.notification).toBeNull();
    expect(r.dismissNotification).toBe(dismissLimit);
  });
});
