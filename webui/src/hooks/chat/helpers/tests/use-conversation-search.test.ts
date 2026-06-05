// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationSearch } from "#webui/hooks/chat/helpers/use-conversation-search";
import { searchConversations } from "#webui/lib/conversation-db";

vi.mock(import("#webui/lib/conversation-db"), () => ({
  searchConversations: vi.fn(),
}));

const mockSearch = vi.mocked(searchConversations);

describe("useConversationSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSearch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no active search", () => {
    const { result } = renderHook(() => useConversationSearch([]));

    expect(result.current.searchQuery).toBe("");
    expect(result.current.matchedIds).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("does not search for a blank query", async () => {
    const { result } = renderHook(() => useConversationSearch([]));

    await act(() => result.current.setSearchQuery("   "));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.matchedIds).toBeNull();
  });

  it("runs a debounced search and exposes the matched IDs", async () => {
    mockSearch.mockResolvedValue(new Set(["conv-1"]));

    const { result } = renderHook(() => useConversationSearch([]));

    await act(() => result.current.setSearchQuery("groove"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockSearch).toHaveBeenCalledWith("groove");
    expect(result.current.matchedIds).toStrictEqual(new Set(["conv-1"]));
  });

  it("clears matched IDs when the query is emptied", async () => {
    mockSearch.mockResolvedValue(new Set(["conv-1"]));

    const { result } = renderHook(() => useConversationSearch([]));

    await act(() => result.current.setSearchQuery("groove"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.matchedIds).toStrictEqual(new Set(["conv-1"]));

    await act(() => result.current.setSearchQuery(""));
    expect(result.current.matchedIds).toBeNull();
  });

  it("discards a stale in-flight result when the query changes", async () => {
    let resolveFirst: (ids: Set<string>) => void = () => {};

    mockSearch
      .mockImplementationOnce(
        () =>
          new Promise<Set<string>>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(new Set(["second"]));

    const { result } = renderHook(() => useConversationSearch([]));

    // First query fires the search but its promise stays pending.
    await act(() => result.current.setSearchQuery("a"));
    await act(() => {
      vi.advanceTimersByTime(150);
    });

    // Second query supersedes it before the first result resolves.
    await act(() => result.current.setSearchQuery("ab"));

    // Resolve the now-stale first search: its result must be ignored.
    await act(async () => {
      resolveFirst(new Set(["first"]));
      await Promise.resolve();
    });
    expect(result.current.matchedIds).toBeNull();

    // The second search resolves and wins.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.matchedIds).toStrictEqual(new Set(["second"]));
  });
});
