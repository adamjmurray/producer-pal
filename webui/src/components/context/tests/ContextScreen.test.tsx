// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { useEffect, useRef } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ContextEditorLabels,
  ContextScreen,
} from "#webui/components/context/ContextScreen";
import { type DocStatus } from "#webui/hooks/context/use-doc";

const editorChange = vi.fn();
const editorFocus = vi.fn();
const editorBlur = vi.fn();
let lastEditorProps: {
  initialValue: string;
  readOnly: boolean;
} | null = null;
// Captures the `initialValue` snapshot at each MOUNT (not re-render). Mimics
// the real MarkdownEditor's seed-only contract — without this, the mock would
// echo every prop change and mask the bug where Clear remounts with stale
// content.
const editorMountedValues: string[] = [];

vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: {
    initialValue: string;
    readOnly: boolean;
    onChange: (v: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => {
    const initialRef = useRef(props.initialValue);

    useEffect(() => {
      editorMountedValues.push(initialRef.current);
    }, []);
    lastEditorProps = {
      initialValue: initialRef.current,
      readOnly: props.readOnly,
    };
    editorChange.mockImplementation(props.onChange);
    editorFocus.mockImplementation(() => props.onFocus?.());
    editorBlur.mockImplementation(() => props.onBlur?.());

    return (
      <textarea
        data-testid="editor"
        defaultValue={initialRef.current}
        readOnly={props.readOnly}
        onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)}
        onFocus={() => props.onFocus?.()}
        onBlur={() => props.onBlur?.()}
      />
    );
  },
}));

const mockStatus = {
  kind: "loading" as "loading" | "ready" | "error",
  content: "",
  message: "",
};

let mockSaveStatus: "idle" | "saving" | "saved" | "error" = "idle";
let mockSaveError: string | null = null;

const saveMock = vi.fn();
const refreshMock = vi.fn();
const clearMock = vi.fn();

const TEST_LABELS: ContextEditorLabels = {
  title: "Project Context",
  loadingLabel: "Loading project context…",
  closeAriaLabel: "Close context editor",
  clearConfirmMessage: "Clear all project memory? This cannot be undone.",
  externalUpdateMessage: "Memory was updated outside the editor.",
  exportBasename: "producer-pal-project-context",
};

/**
 * ContextScreen receives its document memory as a prop (ContextTabs supplies
 * the real hook). This harness rebuilds the mock hook value from the mutable
 * mock* state on every render, so a `rerender(<Harness />)` reflects flipped
 * status the way re-calling the hook used to.
 * @param props - Optional onClose passthrough
 * @param props.onClose - Close handler forwarded to the screen
 * @returns A ContextScreen bound to the mock memory + project labels
 */
function Harness(props: { onClose?: () => void } = {}): preact.JSX.Element {
  return (
    <ContextScreen
      memory={buildHookValue()}
      labels={TEST_LABELS}
      onClose={props.onClose}
    />
  );
}

function buildHookValue() {
  let status: DocStatus;

  if (mockStatus.kind === "ready") {
    status = {
      kind: "ready",
      content: mockStatus.content,
    };
  } else if (mockStatus.kind === "error") {
    status = { kind: "error", message: mockStatus.message };
  } else {
    status = { kind: "loading" };
  }

  return {
    status,
    saveStatus: mockSaveStatus,
    saveError: mockSaveError,
    save: saveMock,
    clear: clearMock,
    refresh: refreshMock,
  };
}

/**
 * Mount a ready ContextScreen, type "draft", fire the debounced save, and
 * assert the first save fired. Used by tests that explore what happens AFTER
 * the initial debounced save (retry on failure, unmount cancellation, etc.).
 * @returns The render result so callers can grab `unmount`.
 */
async function mountAndDebounceSave() {
  mockStatus.kind = "ready";
  mockStatus.content = "old";
  const result = render(<Harness />);

  await act(() => {
    editorChange("draft");
  });
  await act(async () => {
    vi.advanceTimersByTime(800);
    await Promise.resolve();
  });
  expect(saveMock).toHaveBeenCalledTimes(1);

  return result;
}

describe("ContextScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset();
    saveMock.mockResolvedValue(true);
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    clearMock.mockReset();
    clearMock.mockResolvedValue(true);
    editorChange.mockReset();
    editorFocus.mockReset();
    editorBlur.mockReset();
    lastEditorProps = null;
    editorMountedValues.length = 0;
    mockStatus.kind = "loading";
    mockStatus.content = "";
    mockStatus.message = "";
    mockSaveStatus = "idle";
    mockSaveError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state initially", () => {
    render(<Harness />);

    expect(screen.getByText("Loading project context…")).toBeTruthy();
  });

  it("shows error state when status is error", () => {
    mockStatus.kind = "error";
    mockStatus.message = "boom";
    render(<Harness />);

    // The header indicator and the body both display the message.
    const matches = screen.getAllByText("boom");

    expect(matches).toHaveLength(2);
  });

  it("shows editor with content when memory is ready", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "# hello";
    render(<Harness />);

    expect(lastEditorProps?.initialValue).toBe("# hello");
    expect(lastEditorProps?.readOnly).toBe(false);
  });

  it("renders the controls strip when memory is ready", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });

  it("renders Import and Export buttons when ready", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("Export button downloads the current content as a .md file", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "# exported";
    render(<Harness />);

    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLElement;

    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect((anchor as unknown as HTMLAnchorElement).download).toMatch(
      /^producer-pal-project-context-\d{4}-\d{2}-\d{2}\.md$/,
    );
    expect(click).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it("shows a live char/token count that updates as the user types", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "hello"; // 5 chars → ceil(5/4) = 2 tokens
    render(<Harness />);

    expect(screen.getByText(/5 chars · ≈2 tokens/)).toBeTruthy();

    await act(() => {
      editorChange("hi there!"); // 9 chars → ceil(9/4) = 3 tokens
    });

    expect(screen.getByText(/9 chars · ≈3 tokens/)).toBeTruthy();
  });

  it("hides the controls strip while loading", () => {
    render(<Harness />);

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("Clear button calls clear() after confirm", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const confirmMock = vi.fn().mockReturnValue(true);

    vi.stubGlobal("confirm", confirmMock);

    render(<Harness />);

    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(clearMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("Clear remounts the editor with cleared content (not the pre-clear stale doc)", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old content";
    // Real useContextMemory only flips status.content to "" AFTER the POST
    // round-trips. Use a controllable promise so we can interleave the editor
    // remount and the status update the way the bug does in production.
    let resolveClear: (ok: boolean) => void = () => {};

    clearMock.mockImplementation(
      () =>
        new Promise<boolean>((r) => {
          resolveClear = r;
        }),
    );
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const { rerender } = render(<Harness />);

    expect(editorMountedValues).toStrictEqual(["old content"]);

    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });

    // Pre-fix this is where the editor would remount with the stale doc
    // because handleClear bumped `editorKey` before clear() resolved.
    expect(editorMountedValues).toStrictEqual(["old content"]);

    // Server completes the clear: status.content flips, then clear() resolves
    // and the fixed handler bumps `editorKey` → remount with "". The rerender
    // stands in for the owner (ContextTabs) re-rendering with fresh memory when
    // the underlying hook's status flips; it precedes the editorKey bump so the
    // remount reads the cleared content, not the stale doc.
    mockStatus.content = "";
    await act(async () => {
      rerender(<Harness />);
      resolveClear(true);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(editorMountedValues).toStrictEqual(["old content", ""]);
    vi.unstubAllGlobals();
  });

  it("Clear button is a no-op when the user cancels confirm", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const confirmMock = vi.fn().mockReturnValue(false);

    vi.stubGlobal("confirm", confirmMock);

    render(<Harness />);

    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });

    expect(clearMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("debounces save after edit", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    await act(() => {
      editorChange("new");
    });

    expect(saveMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledWith("new");
  });

  it("flushes save on blur", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    await act(() => {
      editorFocus();
    });
    await act(() => {
      editorChange("typed");
    });
    await act(() => {
      editorBlur();
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith("typed");
    });
  });

  it("flushSave is a no-op when there are no edits", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    fireEvent(window, new Event("beforeunload"));

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("blur without pending timer does not save", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    // Focus then blur without typing — no pending debounce timer.
    await act(() => {
      editorFocus();
    });
    await act(() => {
      editorBlur();
    });

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("flushes save on beforeunload", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    await act(() => {
      editorChange("draft");
    });

    fireEvent(window, new Event("beforeunload"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith("draft");
    });
  });

  it("retries the same content on the next flush after a failed save", async () => {
    // First save fails, second succeeds.
    saveMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mountAndDebounceSave();
    // The debounced save fired and failed; the marker was rolled back.
    expect(saveMock).toHaveBeenNthCalledWith(1, "draft");

    // A later flush (blur) retries the unchanged content rather than skipping
    // it as already-saved.
    await act(() => {
      editorBlur();
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
    });
    expect(saveMock).toHaveBeenNthCalledWith(2, "draft");
  });

  it("flushes a pending debounced save on unmount (Esc close mid-debounce)", async () => {
    // Regression: cleanup used to only clear timers, so typing then closing
    // the editor inside the 800ms debounce window dropped the edit. Now the
    // cleanup flushes first so the in-progress edit is dispatched.
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    const { unmount } = render(<Harness />);

    await act(() => {
      editorChange("typed");
    });

    unmount();

    // The flush ran synchronously in cleanup; advancing time should NOT
    // produce any additional saves (the debounce timer was cleared by flush).
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("typed");
  });

  it("auto-retries a failed save after the retry delay", async () => {
    // First save fails, second (retry) succeeds.
    saveMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mountAndDebounceSave();

    // Advance past the unattended retry window without any user interaction.
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
    });
    expect(saveMock).toHaveBeenNthCalledWith(2, "draft");
  });

  it("flushes on unmount instead of waiting for the retry timer after a failed save", async () => {
    // First save fails (lastSavedRef rolls back to null, retry timer armed).
    // Unmount cleanup flushes — since draftRef still differs from
    // lastSavedRef, the flush retries the save synchronously instead of
    // waiting on the unattended-retry timer (which is also cleared so it
    // never fires post-unmount). Subsequent saves succeed.
    saveMock.mockResolvedValueOnce(false);
    const { unmount } = await mountAndDebounceSave();

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenNthCalledWith(2, "draft");

    // Past the retry delay — the cleanup cancelled it, so no further saves.
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it("resets the debounce timer on consecutive edits", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<Harness />);

    await act(() => {
      editorChange("first");
    });
    // Advance partway — timer would fire at 800ms; only 300ms in.
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    // Second edit within the debounce window: clears prior timer.
    await act(() => {
      editorChange("second");
    });
    // Original 800ms boundary now passes, but second timer hasn't elapsed.
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveMock).not.toHaveBeenCalled();

    // Second timer fires.
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("second");
  });

  it("renders 'Saving…' indicator when a save is in flight", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "saving";
    render(<Harness />);

    expect(screen.getByText("Saving…")).toBeTruthy();
  });

  it("renders 'Saved' indicator after a successful save", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "saved";
    render(<Harness />);

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("shows 'Editing…' (not 'Saved') as soon as the user types after a successful save", async () => {
    // Regression: after the first save, 'Saved' lingered through the
    // debounce window of the next edit because the indicator only looked at
    // saveStatus. Now the dirty flag from the editor state hook drives an
    // 'Editing…' state until the next save lands.
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "saved";
    render(<Harness />);

    expect(screen.getByText("Saved")).toBeTruthy();

    await act(() => {
      editorChange("typed");
    });

    expect(screen.getByText("Editing…")).toBeTruthy();
  });

  it("clears 'Editing…' when the user reverts the draft to the last-saved value", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "saved";
    render(<Harness />);

    await act(() => {
      editorChange("typed");
    });
    expect(screen.getByText("Editing…")).toBeTruthy();

    // Undo back to the saved value — should drop the dirty flag without
    // requiring another save round-trip.
    await act(() => {
      editorChange("old");
    });

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("'Save failed' takes precedence over 'Editing…'", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    saveMock.mockResolvedValue(false);
    mockSaveStatus = "error";
    render(<Harness />);

    await act(() => {
      editorChange("typed");
    });

    expect(screen.getByText("Save failed")).toBeTruthy();
  });

  it("renders a close button when onClose is provided and calls it on click", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const onClose = vi.fn();

    render(<Harness onClose={onClose} />);

    const btn = screen.getByLabelText("Close context editor");

    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders 'Save failed' indicator after an error", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "error";
    mockSaveError = "Config update failed";
    render(<Harness />);

    expect(screen.getByText("Save failed")).toBeTruthy();
  });

  it("surfaces the external-update banner when the server content changes while the draft is clean", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    const { rerender } = render(<Harness />);

    // Pre-fix this banner did not exist — the user would never know an
    // AI/device write happened, and their next keystroke would clobber it.
    expect(screen.queryByText("Memory was updated outside the editor.")).toBe(
      null,
    );

    // Status flips because focus refresh fetched the server's new content.
    await act(async () => {
      mockStatus.content = "from-ai";
      rerender(<Harness />);
    });

    expect(
      screen.getByText("Memory was updated outside the editor."),
    ).toBeTruthy();
    // Clicking Reload remounts the editor with the new content as initialValue.
    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    });
    expect(editorMountedValues).toStrictEqual(["old", "from-ai"]);
  });

  describe("built-in reference", () => {
    const BUILTIN_LABELS: ContextEditorLabels = {
      ...TEST_LABELS,
      builtIn: "SHIPPED DEFAULT",
      overridePaneLabel: "Your instructions",
    };

    /**
     * Render a ready ContextScreen bound to labels that carry a built-in
     * reference. The built-in is hidden by default and revealed on request.
     */
    function renderWithBuiltIn(): void {
      mockStatus.kind = "ready";
      mockStatus.content = "MY DRAFT";
      render(
        <ContextScreen memory={buildHookValue()} labels={BUILTIN_LABELS} />,
      );
    }

    it("hides the built-in by default, showing the override editor", () => {
      renderWithBuiltIn();

      expect(screen.getByText("Your instructions")).toBeTruthy();
      expect(screen.getByText("Show default")).toBeTruthy();
      // The default is not on screen until requested.
      expect(screen.queryByText("Default")).toBeNull();
      // The editable pane seeds from the stored draft.
      expect(lastEditorProps?.initialValue).toBe("MY DRAFT");
    });

    it("reveals the read-only built-in on request", async () => {
      renderWithBuiltIn();

      await act(() => {
        fireEvent.click(screen.getByText("Show default"));
      });

      expect(screen.getByText("Default")).toBeTruthy();
      // The revealed built-in mounts a second, read-only editor.
      expect(lastEditorProps?.readOnly).toBe(true);
      expect(editorMountedValues).toContain("SHIPPED DEFAULT");
    });

    it("copies the built-in to the clipboard", async () => {
      const writeText = vi.fn();

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      renderWithBuiltIn();
      await act(() => {
        fireEvent.click(screen.getByText("Show default"));
      });

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

      expect(writeText).toHaveBeenCalledWith("SHIPPED DEFAULT");
    });

    it("autosaves edits made in the override pane", async () => {
      renderWithBuiltIn();

      await act(() => {
        editorChange("edited");
      });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(saveMock).toHaveBeenCalledWith("edited");
    });

    it("shows only the built-in with a Customize fork when there is no override", async () => {
      mockStatus.kind = "ready";
      mockStatus.content = "";
      render(
        <ContextScreen memory={buildHookValue()} labels={BUILTIN_LABELS} />,
      );

      // Built-in-only view: the default is shown read-only with a Customize
      // button; the editable pane and its reveal affordance are absent.
      expect(screen.getByText("Customize")).toBeTruthy();
      expect(screen.queryByText("Your instructions")).toBeNull();
      expect(screen.queryByText("Show default")).toBeNull();
      expect(lastEditorProps?.readOnly).toBe(true);
      expect(editorMountedValues).toContain("SHIPPED DEFAULT");
      // The size readout reflects the 15-char default that's on screen,
      // labelled so it isn't mistaken for the (empty) override.
      expect(screen.getByText(/Default: 15 chars · ≈4 tokens/)).toBeTruthy();

      // Customize forks the built-in into the override (persists it via the
      // import path so the view flips to editing).
      await act(async () => {
        fireEvent.click(screen.getByText("Customize"));
        await Promise.resolve();
      });

      expect(saveMock).toHaveBeenCalledWith("SHIPPED DEFAULT");
    });

    it("shows the drift note when the built-in changed since the user forked", () => {
      mockStatus.kind = "ready";
      mockStatus.content = "MY DRAFT";
      render(
        <ContextScreen
          memory={{
            ...buildHookValue(),
            drift: { drifted: true, forkedFromVersion: "1.4.0" },
          }}
          labels={BUILTIN_LABELS}
        />,
      );

      expect(
        screen.getByText(/Default changed since you forked \(v1\.4\.0\)\./),
      ).toBeTruthy();
    });

    it("shows no drift note when the fork matches the current built-in", () => {
      mockStatus.kind = "ready";
      mockStatus.content = "MY DRAFT";
      render(
        <ContextScreen
          memory={{
            ...buildHookValue(),
            drift: { drifted: false, forkedFromVersion: "1.5.0" },
          }}
          labels={BUILTIN_LABELS}
        />,
      );

      expect(screen.queryByText(/Default changed since you forked/)).toBeNull();
    });

    it("puts reset beside the editable content (no strip Clear when a default exists)", async () => {
      const confirmMock = vi.fn().mockReturnValue(true);

      vi.stubGlobal("confirm", confirmMock);
      renderWithBuiltIn();

      // The always-on strip Clear is gone; the reset trash lives beside the
      // editable content and is reachable without first revealing the default.
      expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

      await act(() => {
        fireEvent.click(screen.getByLabelText("Reset to default"));
      });

      expect(confirmMock).toHaveBeenCalled();
      expect(clearMock).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
