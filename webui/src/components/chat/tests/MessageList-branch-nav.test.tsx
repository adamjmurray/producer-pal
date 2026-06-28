// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "#webui/components/chat/MessageList";
import {
  type BranchNavState,
  type BranchPoint,
} from "#webui/lib/conversation-branch-helpers";
import { type UIMessage } from "#webui/types/messages";

vi.mock(import("#webui/components/chat/assistant/AssistantMessage"), () => ({
  AssistantMessage: ({ parts }: { parts: unknown[] }) => (
    <div data-testid="assistant-message">
      {parts.map((p) => (p as { content?: string }).content ?? "")}
    </div>
  ),
}));

function user(content: string, idx: number): UIMessage {
  return {
    role: "user",
    parts: [{ type: "text", content }],
    rawHistoryIndex: idx,
    timestamp: 0,
  };
}

function model(content: string, idx: number): UIMessage {
  return {
    role: "model",
    parts: [{ type: "text", content }],
    rawHistoryIndex: idx,
    timestamp: 0,
  };
}

function compaction(content: string, idx: number): UIMessage {
  return {
    role: "user",
    parts: [{ type: "compaction", content }],
    rawHistoryIndex: idx,
    timestamp: 0,
  };
}

function renderList(messages: UIMessage[], branchNav?: BranchNavState) {
  return render(
    <MessageList
      messages={messages}
      queuedMessages={[]}
      onRemoveQueued={vi.fn()}
      isAssistantResponding={false}
      handleRetry={vi.fn()}
      handleEdit={vi.fn()}
      showTimestamps={false}
      showTokenUsage={false}
      branchNav={branchNav}
    />,
  );
}

const FORK_AT_0: BranchPoint = {
  anchorIndex: 0,
  siblingIds: ["A", "B"],
  currentIndex: 0,
};

describe("MessageList branch navigation", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders no branch nav without branch points", () => {
    renderList([user("hi", 0), model("yo", 1)]);

    expect(screen.queryByTestId("branch-nav")).toBeNull();
  });

  it("renders the ‹ n/m › control under the fork-point message", () => {
    renderList([user("hi", 0), model("yo", 1)], {
      points: [FORK_AT_0],
      onSwitch: vi.fn(),
    });

    expect(screen.getByTestId("branch-nav-position").textContent).toBe("1 / 2");
    // First branch: previous disabled, next switches to the sibling.
    const prev = screen.getByRole("button", {
      name: /previous version/i,
    }) as HTMLButtonElement;
    const next = screen.getByRole("button", {
      name: /next version/i,
    }) as HTMLButtonElement;

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it("switches to the next sibling when the arrow is clicked", () => {
    const onSwitch = vi.fn();

    renderList([user("hi", 0), model("yo", 1)], {
      points: [FORK_AT_0],
      onSwitch,
    });
    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("B");
  });

  it("switches to the previous sibling from the last branch", () => {
    const onSwitch = vi.fn();

    renderList([user("hi", 0), model("yo", 1)], {
      points: [{ anchorIndex: 0, siblingIds: ["A", "B"], currentIndex: 1 }],
      onSwitch,
    });
    fireEvent.click(screen.getByRole("button", { name: /previous version/i }));

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("A");
  });

  it("renders branch arrows even when the anchor message is empty", () => {
    // A retry fork anchors arrows on the assistant response (index 1). If this
    // sibling's response renders with no parts, the arrows must still show so
    // the user can page back to a sibling that has content.
    const empty: UIMessage = {
      role: "model",
      parts: [],
      rawHistoryIndex: 1,
      timestamp: 0,
    };

    renderList([user("hi", 0), empty], {
      points: [{ anchorIndex: 1, siblingIds: ["A", "B"], currentIndex: 1 }],
      onSwitch: vi.fn(),
    });

    expect(screen.getByTestId("branch-nav-position").textContent).toBe("2 / 2");
  });

  it("indexes the empty-anchor branch row so scroll-to-fork can locate it", () => {
    const empty: UIMessage = {
      role: "model",
      parts: [],
      rawHistoryIndex: 1,
      timestamp: 0,
    };

    const { container } = renderList([user("hi", 0), empty], {
      points: [{ anchorIndex: 1, siblingIds: ["A", "B"], currentIndex: 1 }],
      onSwitch: vi.fn(),
    });

    expect(container.querySelector('[data-message-index="1"]')).not.toBeNull();
  });

  it("renders branch arrows alongside a compaction-divider anchor", () => {
    // A branch point whose anchor index lands on a compaction divider must keep
    // its ‹ n/m › arrows: navigability can't depend on what the anchor renders as.
    renderList([user("hi", 0), compaction("sum", 1)], {
      points: [{ anchorIndex: 1, siblingIds: ["A", "B"], currentIndex: 0 }],
      onSwitch: vi.fn(),
    });

    expect(screen.getByTestId("compaction-divider")).toBeTruthy();
    expect(screen.getByTestId("branch-nav-position").textContent).toBe("1 / 2");
  });

  it("scrolls a compaction-divider anchor into view after the transcript swaps", () => {
    const onSwitch = vi.fn();
    const { rerender } = renderList([user("first", 0), compaction("s1", 1)], {
      points: [{ anchorIndex: 1, siblingIds: ["A", "B"], currentIndex: 0 }],
      onSwitch,
    });

    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    const scrollSpy = vi.fn();

    Element.prototype.scrollIntoView = scrollSpy;
    rerender(
      <MessageList
        messages={[user("first", 0), compaction("s2", 1)]}
        queuedMessages={[]}
        onRemoveQueued={vi.fn()}
        isAssistantResponding={false}
        handleRetry={vi.fn()}
        handleEdit={vi.fn()}
        showTimestamps={false}
        showTokenUsage={false}
        branchNav={{
          points: [{ anchorIndex: 1, siblingIds: ["A", "B"], currentIndex: 1 }],
          onSwitch,
        }}
      />,
    );

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("scrolls the fork-point message into view after the transcript swaps", () => {
    const onSwitch = vi.fn();
    const { rerender } = renderList([user("first", 0), model("a1", 1)], {
      points: [FORK_AT_0],
      onSwitch,
    });

    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    // Simulate the sibling conversation loading: the transcript is replaced.
    const scrollSpy = vi.fn();

    Element.prototype.scrollIntoView = scrollSpy;
    rerender(
      <MessageList
        messages={[user("first", 0), model("a2", 1)]}
        queuedMessages={[]}
        onRemoveQueued={vi.fn()}
        isAssistantResponding={false}
        handleRetry={vi.fn()}
        handleEdit={vi.fn()}
        showTimestamps={false}
        showTokenUsage={false}
        branchNav={{
          points: [{ anchorIndex: 0, siblingIds: ["A", "B"], currentIndex: 1 }],
          onSwitch,
        }}
      />,
    );

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("clears the pending scroll after a no-op switch so the next user message still auto-scrolls", async () => {
    // A switch that doesn't replace the transcript (deleted sibling / voice
    // record) resolves without changing `messages`. The pending fork-scroll ref
    // must be cleared so it can't suppress the next new-user-message scroll.
    let resolveSwitch: () => void = () => {};
    const onSwitch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    const messages = [user("first", 0), model("a1", 1)];
    const { rerender } = renderList(messages, {
      points: [FORK_AT_0],
      onSwitch,
    });

    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    // The switch is a no-op: the transcript array identity is unchanged.
    resolveSwitch();
    await Promise.resolve();

    const scrollSpy = vi.fn();

    Element.prototype.scrollIntoView = scrollSpy;
    rerender(
      <MessageList
        messages={[...messages, user("second", 2)]}
        queuedMessages={[]}
        onRemoveQueued={vi.fn()}
        isAssistantResponding={false}
        handleRetry={vi.fn()}
        handleEdit={vi.fn()}
        showTimestamps={false}
        showTokenUsage={false}
        branchNav={{ points: [FORK_AT_0], onSwitch }}
      />,
    );

    // The new user message scrolls to the bottom (endRef), not the fork point.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
  });
});
