// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { EditorFooter } from "#webui/components/context/collection/collection-editor-parts";
import { type SaveStatus } from "#webui/hooks/context/use-doc";

/**
 * Render an EditorFooter with the given save status/error.
 * @param saveStatus - The save status to display
 * @param saveError - The save error message, if any
 */
function renderFooter(saveStatus: SaveStatus, saveError: string | null): void {
  render(
    <EditorFooter
      saveStatus={saveStatus}
      saveError={saveError}
      isNew={false}
      canSave={true}
      createLabel="Create"
      onSave={vi.fn()}
    />,
  );
}

describe("EditorFooter save status text", () => {
  it("shows nothing when idle", () => {
    renderFooter("idle", null);

    expect(screen.queryByText(/Saving|Saved|failed/)).toBeNull();
  });

  it("shows 'Saving…' while a save is in flight", () => {
    renderFooter("saving", null);

    expect(screen.getByText("Saving…")).toBeTruthy();
  });

  it("shows 'Saved' after a successful save", () => {
    renderFooter("saved", null);

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("shows the error message when a save fails", () => {
    renderFooter("error", "disk full");

    expect(screen.getByText("disk full")).toBeTruthy();
  });

  it("falls back to 'Save failed' when the error has no message", () => {
    renderFooter("error", null);

    expect(screen.getByText("Save failed")).toBeTruthy();
  });
});
