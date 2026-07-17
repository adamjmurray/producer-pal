// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { type VNode } from "preact";
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

function emptyModel(idx: number): UIMessage {
  return {
    role: "model",
    parts: [],
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

// The <MessageList> element under test. Split out from renderList so tests that
// swap the transcript can hand the same element to `rerender`.
function messageListElement(
  messages: UIMessage[],
  branchNav?: BranchNavState,
  isAssistantResponding = false,
): VNode {
  return (
    <MessageList
      messages={messages}
      queuedMessages={[]}
      onRemoveQueued={vi.fn()}
      isAssistantResponding={isAssistantResponding}
      handleRetry={vi.fn()}
      handleEdit={vi.fn()}
      showTimestamps={false}
      showTokenUsage={false}
      branchNav={branchNav}
    />
  );
}

function renderList(
  messages: UIMessage[],
  branchNav?: BranchNavState,
  isAssistantResponding = false,
) {
  return render(messageListElement(messages, branchNav, isAssistantResponding));
}

// Renders the stock two-message transcript forked at a single branch point.
function renderForkedList(
  point: BranchPoint,
  onSwitch: () => void,
  isAssistantResponding = false,
) {
  return renderList(
    [user("hi", 0), model("yo", 1)],
    { points: [point], onSwitch },
    isAssistantResponding,
  );
}

// Renders `before` forked at `point`, clicks ›, then simulates the sibling
// conversation loading: the transcript is replaced by `after` and the branch
// point advances to sibling B. Returns the scrollIntoView spy installed just
// before the swap.
function switchToSiblingAndSwapTranscript(
  before: UIMessage[],
  after: UIMessage[],
  point: BranchPoint,
) {
  const onSwitch = vi.fn();
  const { rerender } = renderList(before, { points: [point], onSwitch });

  fireEvent.click(screen.getByRole("button", { name: /next version/i }));

  const scrollSpy = vi.fn();

  Element.prototype.scrollIntoView = scrollSpy;
  rerender(
    messageListElement(after, {
      points: [{ ...point, currentIndex: 1 }],
      onSwitch,
    }),
  );

  return scrollSpy;
}

// The ‹ and › arrows of the rendered branch-nav control.
function branchArrows(): { prev: HTMLButtonElement; next: HTMLButtonElement } {
  return {
    prev: screen.getByRole("button", {
      name: /previous version/i,
    }) as HTMLButtonElement,
    next: screen.getByRole("button", {
      name: /next version/i,
    }) as HTMLButtonElement,
  };
}

const FORK_AT_0: BranchPoint = {
  anchorIndex: 0,
  siblingIds: ["A", "B"],
  currentIndex: 0,
};

const FORK_AT_0_ON_SIBLING_B: BranchPoint = {
  anchorIndex: 0,
  siblingIds: ["A", "B"],
  currentIndex: 1,
};

const FORK_AT_1: BranchPoint = {
  anchorIndex: 1,
  siblingIds: ["A", "B"],
  currentIndex: 0,
};

const FORK_AT_1_ON_SIBLING_B: BranchPoint = {
  anchorIndex: 1,
  siblingIds: ["A", "B"],
  currentIndex: 1,
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
    renderForkedList(FORK_AT_0, vi.fn());

    expect(screen.getByTestId("branch-nav-position").textContent).toBe("1 / 2");
    // First branch: previous disabled, next switches to the sibling.
    const { prev, next } = branchArrows();

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it("switches to the next sibling when the arrow is clicked", () => {
    const onSwitch = vi.fn();

    renderForkedList(FORK_AT_0, onSwitch);
    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("B");
  });

  it("switches to the previous sibling from the last branch", () => {
    const onSwitch = vi.fn();

    renderForkedList(FORK_AT_0_ON_SIBLING_B, onSwitch);
    fireEvent.click(screen.getByRole("button", { name: /previous version/i }));

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("A");
  });

  it("disables both arrows while the assistant is responding", () => {
    // Switching siblings mid-stream aborts and truncates the streaming fork, so
    // the arrows are gated on isAssistantResponding (like edit/retry). The ‹ n/m ›
    // position still renders so the user can see where they are.
    const onSwitch = vi.fn();

    renderForkedList(FORK_AT_0_ON_SIBLING_B, onSwitch, true);

    const { prev, next } = branchArrows();

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    expect(screen.getByTestId("branch-nav-position").textContent).toBe("2 / 2");

    fireEvent.click(prev);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("renders branch arrows even when the anchor message is empty", () => {
    // A retry fork anchors arrows on the assistant response (index 1). If this
    // sibling's response renders with no parts, the arrows must still show so
    // the user can page back to a sibling that has content.
    renderList([user("hi", 0), emptyModel(1)], {
      points: [FORK_AT_1_ON_SIBLING_B],
      onSwitch: vi.fn(),
    });

    expect(screen.getByTestId("branch-nav-position").textContent).toBe("2 / 2");
  });

  it("indexes the empty-anchor branch row so scroll-to-fork can locate it", () => {
    const { container } = renderList([user("hi", 0), emptyModel(1)], {
      points: [FORK_AT_1_ON_SIBLING_B],
      onSwitch: vi.fn(),
    });

    expect(container.querySelector('[data-message-index="1"]')).not.toBeNull();
  });

  it("renders branch arrows alongside a compaction-divider anchor", () => {
    // A branch point whose anchor index lands on a compaction divider must keep
    // its ‹ n/m › arrows: navigability can't depend on what the anchor renders as.
    renderList([user("hi", 0), compaction("sum", 1)], {
      points: [FORK_AT_1],
      onSwitch: vi.fn(),
    });

    expect(screen.getByTestId("compaction-divider")).toBeTruthy();
    expect(screen.getByTestId("branch-nav-position").textContent).toBe("1 / 2");
  });

  it("scrolls a compaction-divider anchor into view after the transcript swaps", () => {
    const scrollSpy = switchToSiblingAndSwapTranscript(
      [user("first", 0), compaction("s1", 1)],
      [user("first", 0), compaction("s2", 1)],
      FORK_AT_1,
    );

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("scrolls the fork-point message into view after the transcript swaps", () => {
    const scrollSpy = switchToSiblingAndSwapTranscript(
      [user("first", 0), model("a1", 1)],
      [user("first", 0), model("a2", 1)],
      FORK_AT_0,
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
      messageListElement([...messages, user("second", 2)], {
        points: [FORK_AT_0],
        onSwitch,
      }),
    );

    // The new user message scrolls to the bottom (endRef), not the fork point.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
  });
});
