// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render } from "@testing-library/preact";
import { SETTINGS_ANIMATION_MS } from "#webui/hooks/settings/use-settings-close";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock(import("#webui/hooks/settings/use-settings"), () => ({
  useSettings: vi.fn(),
}));

vi.mock(import("#webui/hooks/theme/use-theme"), () => ({
  useTheme: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: vi.fn(),
}));

vi.mock(import("#webui/hooks/chat/use-chat"), () => ({
  useChat: vi.fn(),
}));

vi.mock(import("#webui/hooks/chat/use-conversations"), () => ({
  useConversations: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-remote-config"), () => ({
  useRemoteConfig: vi.fn(),
}));

vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: () => ({ update: null, dismissUpdate: () => {} }),
}));

vi.mock(import("#webui/hooks/view-state/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

// App renders the real ContextTabs + system-prompt hook, both of which fetch a
// same-origin endpoint; stub them so these tests stay focused on the overlay
// open/close plumbing and don't leak real localhost fetches. See
// App-context-mocks for details.
vi.mock(import("#webui/hooks/context/use-system-prompt"), () => ({
  useSystemPrompt: systemPromptDocMock,
}));
vi.mock(import("#webui/components/context/ContextTabs"), () => ({
  ContextTabs: ContextTabsStub,
}));

import { useSettings } from "#webui/hooks/settings/use-settings";
import { useViewState } from "#webui/hooks/view-state/use-view-state";
import {
  ContextTabsStub,
  setStubLeaveGuard,
  systemPromptDocMock,
} from "./App-context-mocks";
import { mockSettingsHook, setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    setStubLeaveGuard(null);
  });

  describe("context overlay", () => {
    // contextOpen is local component state (intentionally not persisted), so
    // these tests drive the overlay through the UI and assert on the DOM rather
    // than mocking view state.
    const contextStub = () =>
      document.querySelector('[data-testid="context-stub"]');

    const openContext = (container: ParentNode) => {
      const btn = container.querySelector('button[aria-label="Context"]');

      if (btn) fireEvent.click(btn);
    };

    /**
     * Open the context overlay under fake timers, run `interact`, then let the
     * 200ms close transition settle so the assertion sees the final state.
     * Callers restore real timers after asserting.
     * @param interact - Drives the case (a key press, a click, ...)
     */
    const openContextThen = async (
      interact: (container: ParentNode) => void,
    ): Promise<void> => {
      vi.useFakeTimers();

      const { container } = render(<App />);

      openContext(container);
      interact(container);
      await act(() => {
        vi.advanceTimersByTime(200);
      });
    };

    it("opens the context overlay via the header button", () => {
      const { container } = render(<App />);

      expect(contextStub()).toBe(null);
      openContext(container);
      expect(contextStub()).not.toBe(null);
    });

    it("wraps the editor in a stable element so tab switches don't re-flash the panel", () => {
      // The overlay fade-in animation targets `.settings-overlay > *`, and
      // ContextTabs remounts its screen root on every tab switch. The editor must
      // sit inside a stable wrapper — remounting the overlay's direct child would
      // re-run the opacity 0→1 fade and flash the blurred chat UI through the panel.
      const { container } = render(<App />);

      openContext(container);
      const overlay = container.querySelector(".settings-overlay");
      const stub = contextStub();

      // The animated direct child is the stable wrapper, not the editor itself.
      expect(stub?.parentElement).not.toBe(overlay);
      expect(overlay?.firstElementChild).toBe(stub?.parentElement);
    });

    it("opens the context overlay from the Settings tools-tab Edit Context link", async () => {
      vi.useFakeTimers();
      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: true,
          settingsTab: "tools",
        },
        setViewState: vi.fn(),
      });

      const { container } = render(<App />);

      expect(contextStub()).toBe(null);
      const editBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent.includes("Edit Context"),
      );

      expect(editBtn).toBeDefined();
      if (editBtn) fireEvent.click(editBtn);
      // Settings runs its close animation first, then Context opens.
      await act(() => {
        vi.advanceTimersByTime(SETTINGS_ANIMATION_MS);
      });

      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("closes the context overlay when the close button is clicked", async () => {
      await openContextThen((container) => {
        const close = container.querySelector(
          'button[aria-label="Close context editor"]',
        );

        if (close) fireEvent.click(close);
      });

      expect(contextStub()).toBe(null);
      vi.useRealTimers();
    });

    it("closes the context overlay on Escape", async () => {
      await openContextThen(() => fireEvent.keyDown(window, { key: "Escape" }));

      expect(contextStub()).toBe(null);
      vi.useRealTimers();
    });

    it("ignores non-Escape keys when the overlay is open", () => {
      const { container } = render(<App />);

      openContext(container);
      fireEvent.keyDown(window, { key: "a" });
      expect(contextStub()).not.toBe(null);
    });

    it("does not close when clicking inside the context view", async () => {
      await openContextThen(() => {
        const inner = contextStub();

        if (inner) fireEvent.click(inner);
      });

      // Backdrop-only dismissal: a click on content shouldn't fire close.
      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("keeps the overlay open on Escape when the leave guard vetoes a dirty draft", async () => {
      // ContextTabs publishes a guard that refuses to leave (unsaved new draft).
      setStubLeaveGuard(() => false);
      await openContextThen(() => fireEvent.keyDown(window, { key: "Escape" }));

      // Escape consulted the guard and was vetoed — overlay stays up.
      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("closes the overlay on Escape when the leave guard approves", async () => {
      setStubLeaveGuard(() => true);
      await openContextThen(() => fireEvent.keyDown(window, { key: "Escape" }));

      expect(contextStub()).toBe(null);
      vi.useRealTimers();
    });

    it("keeps the overlay open on a backdrop click when the leave guard vetoes", async () => {
      setStubLeaveGuard(() => false);
      await openContextThen((container) => {
        const overlay = container.querySelector(".settings-overlay");

        // A backdrop hit (target === currentTarget) routes through the guard.
        if (overlay) {
          fireEvent.mouseDown(overlay);
          fireEvent.click(overlay);
        }
      });

      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("closes the overlay on a backdrop click when the leave guard approves", async () => {
      setStubLeaveGuard(() => true);
      await openContextThen((container) => {
        const overlay = container.querySelector(".settings-overlay");

        if (overlay) {
          fireEvent.mouseDown(overlay);
          fireEvent.mouseUp(overlay);
          fireEvent.click(overlay);
        }
      });

      expect(contextStub()).toBe(null);
      vi.useRealTimers();
    });

    it("keeps the overlay open when a drag starts inside and ends on the backdrop", async () => {
      setStubLeaveGuard(() => true);
      await openContextThen((container) => {
        const overlay = container.querySelector(".settings-overlay");
        const inner = contextStub();

        // The browser fires the click on the overlay (the common ancestor of
        // press and release), but the press began inside the editor.
        if (overlay && inner) {
          fireEvent.mouseDown(inner);
          fireEvent.mouseUp(overlay);
          fireEvent.click(overlay);
        }
      });

      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("keeps the overlay open when a drag starts on the backdrop and ends inside", async () => {
      // The mirror case: the press lands on the overlay, so only the release
      // says the user let go over the editor.
      setStubLeaveGuard(() => true);
      await openContextThen((container) => {
        const overlay = container.querySelector(".settings-overlay");
        const inner = contextStub();

        if (overlay && inner) {
          fireEvent.mouseDown(overlay);
          fireEvent.mouseUp(inner);
          fireEvent.click(overlay);
        }
      });

      expect(contextStub()).not.toBe(null);
      vi.useRealTimers();
    });

    it("Esc closes Context first when both overlays are open, leaving Settings up", async () => {
      // Both overlays open with settings configured + no unsaved changes —
      // user manually opened Settings while Context was up. Pre-fix, both
      // Esc handlers fire (Settings dismisses AND Context closes in the same
      // tick). With the fix, Settings yields the Esc to Context: Context
      // closes, Settings stays up, and a subsequent Esc dismisses Settings.
      vi.useFakeTimers();
      const mockSetViewState = vi.fn();

      (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockSettingsHook,
        settingsConfigured: true,
      });
      (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
        viewState: {
          historyPanelOpen: false,
          settingsOpen: true,
          settingsTab: "connection",
        },
        setViewState: mockSetViewState,
      });

      const { container } = render(<App />);

      openContext(container);
      // Both overlays mounted.
      expect(document.body.textContent).toContain("Provider");
      expect(contextStub()).not.toBe(null);

      // Real keydown events bubble document → window, so dispatching once is
      // enough to exercise both potential listeners.
      fireEvent.keyDown(document, { key: "Escape" });
      await act(() => {
        vi.advanceTimersByTime(200);
      });

      // Context closes; Settings stays up — no settingsOpen:false was emitted.
      expect(contextStub()).toBe(null);
      expect(document.body.textContent).toContain("Provider");
      expect(mockSetViewState).not.toHaveBeenCalledWith({
        settingsOpen: false,
      });
      vi.useRealTimers();
    });
  });
});
