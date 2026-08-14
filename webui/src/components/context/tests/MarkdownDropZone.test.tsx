// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownDropZone } from "#webui/components/context/MarkdownDropZone";
import { useImportNotice } from "#webui/hooks/context/use-import-notice";

const OVERLAY_TEXT = "Drop a .md file to import";

/**
 * A wired drop zone: threads the real {@link useImportNotice} hook into the
 * (now controlled) drop zone, exactly as the screens do, so rejection notices
 * render and auto-clear under test.
 * @param props - The onImportText spy to forward
 * @param props.onImportText - Called with a dropped file's text once read
 * @returns The wired drop zone element
 */
function DropZoneHarness(props: {
  onImportText: (text: string) => void;
}): preact.JSX.Element {
  const { notice, showNotice } = useImportNotice();

  return (
    <MarkdownDropZone
      onImportText={props.onImportText}
      notice={notice}
      onReject={showNotice}
    >
      <div data-testid="child">editor</div>
    </MarkdownDropZone>
  );
}

/**
 * Render a drop zone wrapping a child target, returning the child element and
 * the onImportText spy.
 * @returns The child node and import spy
 */
function renderZone(): {
  child: HTMLElement;
  onImportText: ReturnType<typeof vi.fn>;
} {
  const onImportText = vi.fn();

  render(<DropZoneHarness onImportText={onImportText} />);

  return { child: screen.getByTestId("child"), onImportText };
}

/**
 * A File-shaped stub with a controllable `text()`.
 * @param name - File name
 * @param type - MIME type
 * @param text - Body returned by text()
 * @param size - Byte size (defaults to 0, i.e. under the import cap)
 * @returns A File-shaped object
 */
function fakeFile(
  name: string,
  type: string,
  text = "dropped body",
  size = 0,
): File {
  return {
    name,
    type,
    size,
    text: () => Promise.resolve(text),
  } as unknown as File;
}

/**
 * A drag data transfer stub carrying file(s).
 * @param files - Files the transfer carries (empty during dragover)
 * @returns A DataTransfer-shaped stub
 */
function fileTransfer(files: File[]): { types: string[]; files: File[] } {
  return { types: ["Files"], files };
}

describe("MarkdownDropZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the overlay while a file is dragged over and hides it on leave", () => {
    const { child } = renderZone();

    fireEvent.dragEnter(child, { dataTransfer: fileTransfer([]) });
    expect(screen.getByText(OVERLAY_TEXT)).toBeTruthy();

    fireEvent.dragLeave(child, { dataTransfer: fileTransfer([]) });
    expect(screen.queryByText(OVERLAY_TEXT)).toBeNull();
  });

  it("preventDefaults dragover so the region is a valid drop target", () => {
    const { child } = renderZone();

    // happy-dom doesn't reflect a capture-phase preventDefault in the event's
    // return value, so spy on the prototype method. preventDefault is what marks
    // the element droppable (without it the browser rejects the drop).
    const preventDefault = vi.spyOn(Event.prototype, "preventDefault");

    fireEvent.dragOver(child, { dataTransfer: fileTransfer([]) });

    expect(preventDefault).toHaveBeenCalled();
  });

  it("imports a dropped markdown file's text", async () => {
    const { child, onImportText } = renderZone();

    fireEvent.drop(child, {
      dataTransfer: fileTransfer([fakeFile("notes.md", "", "# hello")]),
    });

    await vi.waitFor(() =>
      expect(onImportText).toHaveBeenCalledWith("# hello"),
    );
  });

  it("rejects a dropped non-text file with a notice", () => {
    const { child, onImportText } = renderZone();

    fireEvent.drop(child, {
      dataTransfer: fileTransfer([fakeFile("cover.png", "image/png")]),
    });

    expect(onImportText).not.toHaveBeenCalled();
    expect(screen.getByText("Not a markdown file")).toBeTruthy();
  });

  it("rejects a dropped file over the size cap with a notice", () => {
    const { child, onImportText } = renderZone();
    // 2 MB — over the 1 MB import cap.
    const tooBig = fakeFile("huge.md", "text/markdown", "x", 2 * 1024 * 1024);

    fireEvent.drop(child, { dataTransfer: fileTransfer([tooBig]) });

    expect(onImportText).not.toHaveBeenCalled();
    expect(screen.getByText(/File too large/)).toBeTruthy();
  });

  it("says nothing when a drop carries no file at all", () => {
    const { child, onImportText } = renderZone();

    // types include "Files" (so the drop is handled) but the file list is empty.
    fireEvent.drop(child, { dataTransfer: fileTransfer([]) });

    expect(onImportText).not.toHaveBeenCalled();
    expect(screen.queryByText("Not a markdown file")).toBeNull();
  });

  it("clears a rejection notice after the timeout", async () => {
    vi.useFakeTimers();

    try {
      const { child } = renderZone();

      fireEvent.drop(child, {
        dataTransfer: fileTransfer([fakeFile("cover.png", "image/png")]),
      });
      expect(screen.getByText("Not a markdown file")).toBeTruthy();

      await vi.advanceTimersByTimeAsync(4000);

      expect(screen.queryByText("Not a markdown file")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearNotice removes a showing rejection notice immediately", () => {
    // Reproduces the stale-notice bug: a rejected drop shows the red notice
    // (which otherwise lingers for the full 4s), but a *successful* import
    // landing within that window must clear it at once — else the error overlay
    // sits over freshly-imported content. The screens call clearNotice from the
    // import success path (context-io's onImportSuccess); here a button stands in
    // for that path so this test targets the hook seam directly.
    function ClearHarness(): preact.JSX.Element {
      const { notice, showNotice, clearNotice } = useImportNotice();

      return (
        <div>
          <MarkdownDropZone
            onImportText={() => {}}
            notice={notice}
            onReject={showNotice}
          >
            <div data-testid="child">editor</div>
          </MarkdownDropZone>
          <button type="button" onClick={clearNotice}>
            import ok
          </button>
        </div>
      );
    }

    render(<ClearHarness />);

    fireEvent.drop(screen.getByTestId("child"), {
      dataTransfer: fileTransfer([fakeFile("cover.png", "image/png")]),
    });
    expect(screen.getByText("Not a markdown file")).toBeTruthy();

    fireEvent.click(screen.getByText("import ok"));

    expect(screen.queryByText("Not a markdown file")).toBeNull();
  });

  it("ignores a non-file drag (e.g. editor text reorder) and shows no overlay", () => {
    const { child, onImportText } = renderZone();

    const dt = { types: ["text/plain"], files: [] };

    fireEvent.dragEnter(child, { dataTransfer: dt });
    expect(screen.queryByText(OVERLAY_TEXT)).toBeNull();

    fireEvent.drop(child, { dataTransfer: dt });
    expect(onImportText).not.toHaveBeenCalled();
  });

  it("passes non-file dragover and dragleave through without preventing default", () => {
    const { child } = renderZone();
    const preventDefault = vi.spyOn(Event.prototype, "preventDefault");
    const dt = { types: ["text/plain"], files: [] };

    // Both handlers early-return when the drag carries no files, so they never
    // preventDefault (which would claim the drop) nor touch the overlay.
    fireEvent.dragOver(child, { dataTransfer: dt });
    fireEvent.dragLeave(child, { dataTransfer: dt });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByText(OVERLAY_TEXT)).toBeNull();
  });
});
