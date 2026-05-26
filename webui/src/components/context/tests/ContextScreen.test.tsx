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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextScreen } from "#webui/components/context/ContextScreen";
import { type ContextMemoryStatus } from "#webui/hooks/context/use-context-memory";

const editorChange = vi.fn();
const editorFocus = vi.fn();
const editorBlur = vi.fn();
let lastEditorProps: {
  initialValue: string;
  readOnly: boolean;
} | null = null;

vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: {
    initialValue: string;
    readOnly: boolean;
    onChange: (v: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => {
    lastEditorProps = {
      initialValue: props.initialValue,
      readOnly: props.readOnly,
    };
    editorChange.mockImplementation(props.onChange);
    editorFocus.mockImplementation(() => props.onFocus?.());
    editorBlur.mockImplementation(() => props.onBlur?.());

    return (
      <textarea
        data-testid="editor"
        defaultValue={props.initialValue}
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

let mockEnabled = true;
let mockWritable = false;
let mockSaveStatus: "idle" | "saving" | "saved" | "error" = "idle";
let mockSaveError: string | null = null;

const saveMock = vi.fn();
const refreshMock = vi.fn();
const setEnabledMock = vi.fn();
const setWritableMock = vi.fn();
const clearMock = vi.fn();

vi.mock(import("#webui/hooks/context/use-context-memory"), () => ({
  useContextMemory: () => buildHookValue(),
}));

function buildHookValue() {
  let status: ContextMemoryStatus;

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
    enabled: mockEnabled,
    writable: mockWritable,
    saveStatus: mockSaveStatus,
    saveError: mockSaveError,
    save: saveMock,
    setEnabled: setEnabledMock,
    setWritable: setWritableMock,
    clear: clearMock,
    refresh: refreshMock,
  };
}

describe("ContextScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset();
    saveMock.mockResolvedValue(true);
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    setEnabledMock.mockReset();
    setEnabledMock.mockResolvedValue(true);
    setWritableMock.mockReset();
    setWritableMock.mockResolvedValue(true);
    clearMock.mockReset();
    clearMock.mockResolvedValue(true);
    editorChange.mockReset();
    editorFocus.mockReset();
    editorBlur.mockReset();
    lastEditorProps = null;
    mockStatus.kind = "loading";
    mockStatus.content = "";
    mockStatus.message = "";
    mockEnabled = true;
    mockWritable = false;
    mockSaveStatus = "idle";
    mockSaveError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state initially", () => {
    render(<ContextScreen />);

    expect(screen.getByText("Loading project context…")).toBeTruthy();
  });

  it("shows the editor (not a dead-end page) even when memory is disabled", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "user notes";
    mockEnabled = false;
    render(<ContextScreen />);

    // Editor is still mounted so the user can read/edit.
    expect(lastEditorProps?.initialValue).toBe("user notes");
    // Inline banner explains the disabled state and offers a recovery action.
    expect(
      screen.getByText("Project memory is off — Claude won't see this."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable" })).toBeTruthy();
  });

  it("clicking Enable in the disabled banner calls setEnabled(true)", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "";
    mockEnabled = false;
    render(<ContextScreen />);

    const enableBtn = screen.getByRole("button", { name: "Enable" });

    await act(() => {
      fireEvent.click(enableBtn);
    });

    expect(setEnabledMock).toHaveBeenCalledWith(true);
  });

  it("shows error state when status is error", () => {
    mockStatus.kind = "error";
    mockStatus.message = "boom";
    render(<ContextScreen />);

    // The header indicator and the body both display the message.
    const matches = screen.getAllByText("boom");

    expect(matches).toHaveLength(2);
  });

  it("shows editor with content when memory is ready", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "# hello";
    render(<ContextScreen />);

    expect(lastEditorProps?.initialValue).toBe("# hello");
    expect(lastEditorProps?.readOnly).toBe(false);
  });

  it("renders the controls strip when memory is ready", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    render(<ContextScreen />);

    expect(screen.getByLabelText("Use project memory")).toBeTruthy();
    expect(screen.getByLabelText("AI can edit memory")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });

  it("hides the controls strip while loading", () => {
    render(<ContextScreen />);

    expect(screen.queryByLabelText("Use project memory")).toBeNull();
  });

  it("toggling 'Use project memory' calls setEnabled with the new value", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    mockEnabled = true;
    render(<ContextScreen />);

    const toggle = screen.getByLabelText(
      "Use project memory",
    ) as HTMLInputElement;

    await act(() => {
      fireEvent.click(toggle);
    });

    expect(setEnabledMock).toHaveBeenCalledWith(false);
  });

  it("toggling 'AI can edit memory' calls setWritable with the new value", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    mockWritable = false;
    render(<ContextScreen />);

    const toggle = screen.getByLabelText(
      "AI can edit memory",
    ) as HTMLInputElement;

    await act(() => {
      fireEvent.click(toggle);
    });

    expect(setWritableMock).toHaveBeenCalledWith(true);
  });

  it("Clear button calls clear() after confirm", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const confirmMock = vi.fn().mockReturnValue(true);

    vi.stubGlobal("confirm", confirmMock);

    render(<ContextScreen />);

    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(clearMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("Clear button is a no-op when the user cancels confirm", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const confirmMock = vi.fn().mockReturnValue(false);

    vi.stubGlobal("confirm", confirmMock);

    render(<ContextScreen />);

    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    });

    expect(clearMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("debounces save after edit", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<ContextScreen />);

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
    render(<ContextScreen />);

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
    render(<ContextScreen />);

    fireEvent(window, new Event("beforeunload"));

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("blur without pending timer does not save", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<ContextScreen />);

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
    render(<ContextScreen />);

    await act(() => {
      editorChange("draft");
    });

    fireEvent(window, new Event("beforeunload"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith("draft");
    });
  });

  it("retries the same content on the next flush after a failed save", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    // First save fails, second succeeds.
    saveMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ContextScreen />);

    await act(() => {
      editorChange("draft");
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    // The debounced save fired and failed; the marker was rolled back.
    expect(saveMock).toHaveBeenCalledTimes(1);
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

  it("clears any pending debounce timer when unmounted", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    const { unmount } = render(<ContextScreen />);

    await act(() => {
      editorChange("typed");
    });

    unmount();

    // Advance past the debounce window — the timer should have been cleared.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("resets the debounce timer on consecutive edits", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    render(<ContextScreen />);

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
    render(<ContextScreen />);

    expect(screen.getByText("Saving…")).toBeTruthy();
  });

  it("renders 'Saved' indicator after a successful save", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "saved";
    render(<ContextScreen />);

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("renders a close button when onClose is provided and calls it on click", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "x";
    const onClose = vi.fn();

    render(<ContextScreen onClose={onClose} />);

    const btn = screen.getByLabelText("Close project context");

    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders 'Save failed' indicator after an error", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "error";
    mockSaveError = "AI updates are disabled";
    render(<ContextScreen />);

    expect(screen.getByText("Save failed")).toBeTruthy();
  });
});
