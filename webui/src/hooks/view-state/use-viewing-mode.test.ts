// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { useViewingMode } from "#webui/hooks/view-state/use-viewing-mode";

/**
 * A record carrying only the field the hook reads.
 * @param sessionType - The record's session type, or undefined for an old record
 * @returns The record, typed for the handler
 */
function record(sessionType?: string): ConversationRecord {
  return { sessionType } as unknown as ConversationRecord;
}

describe("useViewingMode", () => {
  it("follows the saved model until a foreign record pins a mode", () => {
    const { result } = renderHook(() => useViewingMode());

    expect(result.current.viewingMode).toBeNull();
  });

  it("pins voice for a voice record and chat for anything else", async () => {
    const { result } = renderHook(() => useViewingMode());

    await act(() => {
      result.current.onForeignRecord(record("voice"));
    });
    expect(result.current.viewingMode).toBe("voice");

    await act(() => {
      result.current.onForeignRecord(record("chat"));
    });
    expect(result.current.viewingMode).toBe("chat");

    // An older record predating sessionType is a chat one.
    await act(() => {
      result.current.onForeignRecord(record());
    });
    expect(result.current.viewingMode).toBe("chat");
  });

  it("drops the override so the next session follows the saved model", async () => {
    const { result } = renderHook(() => useViewingMode());

    await act(() => {
      result.current.onForeignRecord(record("voice"));
    });
    await act(() => {
      result.current.clearViewingMode();
    });

    expect(result.current.viewingMode).toBeNull();
  });
});
