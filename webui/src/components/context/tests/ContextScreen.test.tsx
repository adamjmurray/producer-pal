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
  value: string;
  readOnly: boolean;
} | null = null;

vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: {
    value: string;
    readOnly: boolean;
    onChange: (v: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => {
    lastEditorProps = { value: props.value, readOnly: props.readOnly };
    editorChange.mockImplementation(props.onChange);
    editorFocus.mockImplementation(() => props.onFocus?.());
    editorBlur.mockImplementation(() => props.onBlur?.());

    return (
      <textarea
        data-testid="editor"
        value={props.value}
        readOnly={props.readOnly}
        onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)}
        onFocus={() => props.onFocus?.()}
        onBlur={() => props.onBlur?.()}
      />
    );
  },
}));

const mockStatus = {
  kind: "loading" as "loading" | "ready" | "disabled" | "error",
  content: "",
  message: "",
};

let mockSaveStatus: "idle" | "saving" | "saved" | "error" = "idle";
let mockSaveError: string | null = null;

const saveMock = vi.fn();
const refreshMock = vi.fn();

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
  } else if (mockStatus.kind === "disabled") {
    status = { kind: "disabled" };
  } else {
    status = { kind: "loading" };
  }

  return {
    status,
    saveStatus: mockSaveStatus,
    saveError: mockSaveError,
    save: saveMock,
    refresh: refreshMock,
  };
}

describe("ContextScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockReset();
    saveMock.mockResolvedValue(undefined);
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    editorChange.mockReset();
    editorFocus.mockReset();
    editorBlur.mockReset();
    lastEditorProps = null;
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
    render(<ContextScreen />);

    expect(screen.getByText("Loading project context…")).toBeTruthy();
  });

  it("shows disabled message when memory is disabled", () => {
    mockStatus.kind = "disabled";
    render(<ContextScreen />);

    // Both the header indicator and the body explain the disabled state.
    expect(screen.getByText("Disabled in device settings")).toBeTruthy();
    expect(screen.getByText(/Project context is disabled/)).toBeTruthy();
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

    expect(lastEditorProps?.value).toBe("# hello");
    expect(lastEditorProps?.readOnly).toBe(false);
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

  it("does not replay server content into the editor after initial load", async () => {
    mockStatus.kind = "ready";
    mockStatus.content = "version 1";
    const { rerender } = render(<ContextScreen />);

    expect(lastEditorProps?.value).toBe("version 1");

    // A subsequent server status change (save echo, AI write, etc.) must
    // not overwrite the local draft — last-write-wins per spec.
    mockStatus.content = "version 2";
    await act(() => {
      rerender(<ContextScreen />);
    });

    expect(lastEditorProps?.value).toBe("version 1");
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

  it("renders 'Save failed' indicator after an error", () => {
    mockStatus.kind = "ready";
    mockStatus.content = "old";
    mockSaveStatus = "error";
    mockSaveError = "AI updates are disabled";
    render(<ContextScreen />);

    expect(screen.getByText("Save failed")).toBeTruthy();
  });
});
