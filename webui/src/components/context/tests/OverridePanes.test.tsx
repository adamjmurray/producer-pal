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
// seeded value so we can assert each pane's content without a real editor. The
// built-in pane renders through this same component (read-only), so a shown
// built-in appears as a second editor node.
vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: { initialValue: string; readOnly: boolean }) => (
    <div data-testid="editor" data-readonly={String(props.readOnly)}>
      {props.initialValue}
    </div>
  ),
}));

/**
 * Render OverridePanes with sensible defaults.
 * @param over - Props to override on the defaults
 * @returns The render result and the toggle/reset/customize spies
 */
function renderPanes(over: Partial<Parameters<typeof OverridePanes>[0]> = {}) {
  const onToggleBuiltIn = vi.fn();
  const onReset = vi.fn();
  const onCustomize = vi.fn();
  const result = render(
    <OverridePanes
      editorKey={0}
      value="MY OVERRIDE"
      builtIn="SHIPPED DEFAULT"
      overrideLabel="Your override"
      showBuiltIn={false}
      onToggleBuiltIn={onToggleBuiltIn}
      onReset={onReset}
      onCustomize={onCustomize}
      onChange={vi.fn()}
      onBlur={vi.fn()}
      {...over}
    />,
  );

  return { ...result, onToggleBuiltIn, onReset, onCustomize };
}

describe("OverridePanes", () => {
  it("hides the built-in by default, showing only the editable override", () => {
    renderPanes();

    expect(screen.getByText("Your override")).toBeTruthy();
    expect(screen.getByTestId("editor").textContent).toBe("MY OVERRIDE");
    // The built-in reference is not on screen until requested.
    expect(screen.queryByText("Built-in (read-only)")).toBeNull();
    expect(screen.queryByText("SHIPPED DEFAULT")).toBeNull();
    expect(screen.getByText("Show built-in")).toBeTruthy();
  });

  it("requests the built-in when Show built-in is clicked", () => {
    const { onToggleBuiltIn } = renderPanes();

    fireEvent.click(screen.getByText("Show built-in"));

    expect(onToggleBuiltIn).toHaveBeenCalledWith(true);
  });

  it("renders the built-in read-only beside the editor when shown", () => {
    renderPanes({ showBuiltIn: true });

    expect(screen.getByText("Built-in (read-only)")).toBeTruthy();
    const editors = screen.getAllByTestId("editor");

    // Two editors: the editable override and the read-only built-in.
    expect(editors.map((e) => e.textContent)).toStrictEqual([
      "MY OVERRIDE",
      "SHIPPED DEFAULT",
    ]);
    const builtIn = editors.find((e) => e.textContent === "SHIPPED DEFAULT");

    expect(builtIn?.getAttribute("data-readonly")).toBe("true");
    // No "Show built-in" affordance while it is already visible.
    expect(screen.queryByText("Show built-in")).toBeNull();
  });

  it("copies the built-in to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("navigator", { clipboard: { writeText } });

    renderPanes({ showBuiltIn: true });
    fireEvent.click(screen.getByText("Copy"));

    expect(writeText).toHaveBeenCalledWith("SHIPPED DEFAULT");
    // The shared CopyButton confirms by flipping its label.
    expect(await screen.findByText("Copied")).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("requests hiding the built-in when Hide is clicked", () => {
    const { onToggleBuiltIn } = renderPanes({ showBuiltIn: true });

    fireEvent.click(screen.getByText("Hide"));

    expect(onToggleBuiltIn).toHaveBeenCalledWith(false);
  });

  it("resets and collapses the built-in when Reset to default is clicked", () => {
    const { onReset, onToggleBuiltIn } = renderPanes({ showBuiltIn: true });

    fireEvent.click(screen.getByText("Reset to default"));

    expect(onReset).toHaveBeenCalledOnce();
    // Collapsing the reveal returns the parent to single-column width for the
    // built-in-only view that follows the reset.
    expect(onToggleBuiltIn).toHaveBeenCalledWith(false);
  });

  describe("no override yet", () => {
    it("shows only the built-in default with a Customize button", () => {
      renderPanes({ value: "" });

      // The built-in is the sole content, read-only; no editable pane or its
      // reveal affordance is shown.
      const editors = screen.getAllByTestId("editor");

      expect(editors).toHaveLength(1);
      expect(editors[0]?.textContent).toBe("SHIPPED DEFAULT");
      expect(editors[0]?.getAttribute("data-readonly")).toBe("true");
      expect(screen.getByText("Customize")).toBeTruthy();
      expect(screen.queryByText("Your override")).toBeNull();
      expect(screen.queryByText("Show built-in")).toBeNull();
      expect(screen.queryByText("Reset to default")).toBeNull();
    });

    it("forks the built-in into an override when Customize is clicked", () => {
      const { onCustomize } = renderPanes({ value: "" });

      fireEvent.click(screen.getByText("Customize"));

      expect(onCustomize).toHaveBeenCalledOnce();
    });
  });
});
