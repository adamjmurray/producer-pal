// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { OverridePanes } from "#webui/components/context/OverridePanes";

// The MarkdownEditor wires CodeMirror; stub it to a plain node echoing the
// seeded value so we can assert the editable pane without a real editor.
vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: { initialValue: string }) => (
    <div data-testid="editor">{props.initialValue}</div>
  ),
}));

/**
 * Render OverridePanes with sensible defaults.
 * @param over - Props to override on the defaults
 * @returns The render result
 */
function renderPanes(over: Partial<Parameters<typeof OverridePanes>[0]> = {}) {
  return render(
    <OverridePanes
      editorKey={0}
      value="MY OVERRIDE"
      builtIn="SHIPPED DEFAULT"
      overrideLabel="Your override"
      onChange={vi.fn()}
      onBlur={vi.fn()}
      {...over}
    />,
  );
}

describe("OverridePanes", () => {
  it("shows the editable override beside the read-only built-in", () => {
    renderPanes();

    expect(screen.getByText("Your override")).toBeTruthy();
    expect(screen.getByTestId("editor").textContent).toBe("MY OVERRIDE");
    expect(screen.getByText("Built-in (read-only)")).toBeTruthy();
    expect(screen.getByText("SHIPPED DEFAULT")).toBeTruthy();
  });

  it("copies the built-in to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("navigator", { clipboard: { writeText } });

    renderPanes();
    fireEvent.click(screen.getByText("Copy"));

    expect(writeText).toHaveBeenCalledWith("SHIPPED DEFAULT");

    vi.unstubAllGlobals();
  });

  it("hides and re-shows the built-in pane", () => {
    renderPanes();

    fireEvent.click(screen.getByText("Hide"));
    // Built-in pane and its Copy button are gone; a "Show built-in" affordance
    // takes their place so the editor can use the full width.
    expect(screen.queryByText("Built-in (read-only)")).toBeNull();
    expect(screen.queryByText("SHIPPED DEFAULT")).toBeNull();

    fireEvent.click(screen.getByText("Show built-in"));
    expect(screen.getByText("Built-in (read-only)")).toBeTruthy();
    expect(screen.getByText("SHIPPED DEFAULT")).toBeTruthy();
  });
});
