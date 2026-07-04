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

const OVERLAY_TEXT = "Drop a .md file to import";

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

  render(
    <MarkdownDropZone onImportText={onImportText}>
      <div data-testid="child">editor</div>
    </MarkdownDropZone>,
  );

  return { child: screen.getByTestId("child"), onImportText };
}

/**
 * A File-shaped stub with a controllable `text()`.
 * @param name - File name
 * @param type - MIME type
 * @param text - Body returned by text()
 * @returns A File-shaped object
 */
function fakeFile(name: string, type: string, text = "dropped body"): File {
  return { name, type, text: () => Promise.resolve(text) } as unknown as File;
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

  it("ignores a dropped non-text file", () => {
    const { child, onImportText } = renderZone();

    fireEvent.drop(child, {
      dataTransfer: fileTransfer([fakeFile("cover.png", "image/png")]),
    });

    expect(onImportText).not.toHaveBeenCalled();
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
