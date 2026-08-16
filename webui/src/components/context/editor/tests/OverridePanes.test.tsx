// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { type VNode } from "preact";
import { useRef } from "preact/hooks";
import { describe, expect, it, vi } from "vitest";
import { OverridePanes } from "#webui/components/context/editor/OverridePanes";

// The MarkdownEditor wires CodeMirror; stub it to a textarea that captures its
// seed at MOUNT, so the stub honors the real editor's uncontrolled contract —
// a re-seed needs a remount. That's what makes the fork test meaningful: if the
// key changed across the fork, the remount would re-seed and lose the edit. The
// built-in reference pane renders through this same component (read-only), so a
// shown built-in appears as a second editor node.
vi.mock(import("#webui/components/markdown-editor/MarkdownEditor"), () => ({
  MarkdownEditor: (props: {
    initialValue: string;
    readOnly?: boolean;
    onChange: (value: string) => void;
  }) => {
    const seeded = useRef(props.initialValue);

    return (
      <textarea
        data-testid="editor"
        data-readonly={String(props.readOnly)}
        defaultValue={seeded.current}
        onInput={(event) =>
          props.onChange((event.target as HTMLTextAreaElement).value)
        }
      />
    );
  },
}));

type PaneProps = Parameters<typeof OverridePanes>[0];

/**
 * Render OverridePanes with sensible defaults.
 * @param over - Props to override on the defaults
 * @returns The spies plus `rerenderPanes(over)`, which re-renders with new props
 */
function renderPanes(over: Partial<PaneProps> = {}) {
  const onToggleBuiltIn = vi.fn();
  const onReset = vi.fn().mockResolvedValue(true);
  const onBeginOverride = vi.fn();
  const onChange = vi.fn();
  const el = (next: Partial<PaneProps>): VNode => (
    <OverridePanes
      editorKey={0}
      hasOverride={true}
      value="MY OVERRIDE"
      builtIn="SHIPPED DEFAULT"
      overrideLabel="Your override"
      showBuiltIn={false}
      onToggleBuiltIn={onToggleBuiltIn}
      onReset={onReset}
      onBeginOverride={onBeginOverride}
      onChange={onChange}
      onBlur={vi.fn()}
      {...next}
    />
  );
  const { rerender } = render(el(over));

  return {
    onToggleBuiltIn,
    onReset,
    onBeginOverride,
    onChange,
    rerenderPanes: (next: Partial<PaneProps>) => rerender(el(next)),
  };
}

/**
 * The seeded values of the currently-rendered editors, in DOM order. When the
 * built-in is revealed there are two: the override, then the read-only built-in.
 * @returns Each editor's value
 */
function editorValues(): string[] {
  return screen
    .getAllByTestId("editor")
    .map((editor) => (editor as HTMLTextAreaElement).value);
}

describe("OverridePanes", () => {
  it("hides the built-in by default, showing only the editable override", () => {
    renderPanes();

    expect(screen.getByText("Your override")).toBeTruthy();
    expect(editorValues()).toStrictEqual(["MY OVERRIDE"]);
    // The default reference is not on screen until requested.
    expect(screen.queryByText("Default")).toBeNull();
    expect(screen.getByText("Show default")).toBeTruthy();
  });

  it("requests the default when Show default is clicked", () => {
    const { onToggleBuiltIn } = renderPanes();

    fireEvent.click(screen.getByText("Show default"));

    expect(onToggleBuiltIn).toHaveBeenCalledWith(true);
  });

  it("renders the default read-only beside the editor when shown", () => {
    renderPanes({ showBuiltIn: true });

    expect(screen.getByText("Default")).toBeTruthy();
    // Two editors: the editable override and the read-only built-in.
    expect(editorValues()).toStrictEqual(["MY OVERRIDE", "SHIPPED DEFAULT"]);

    const editors = screen.getAllByTestId("editor");

    expect(editors.map((e) => e.getAttribute("data-readonly"))).toStrictEqual([
      "false",
      "true",
    ]);
    // No "Show default" affordance while it is already visible.
    expect(screen.queryByText("Show default")).toBeNull();
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

  it("resets and collapses the built-in when Reset to default is clicked", async () => {
    const { onReset, onToggleBuiltIn } = renderPanes({ showBuiltIn: true });

    fireEvent.click(screen.getByLabelText("Reset to default"));

    expect(onReset).toHaveBeenCalledOnce();
    // Collapsing the reveal returns the parent to single-column width for the
    // built-in-only view that follows the reset. It waits for the reset to
    // actually happen (onReset resolves true).
    await waitFor(() => {
      expect(onToggleBuiltIn).toHaveBeenCalledWith(false);
    });
  });

  it("keeps the built-in revealed when the reset is cancelled", async () => {
    // Regression: the collapse used to fire unconditionally BEFORE onReset,
    // so cancelling the reset's confirm dialog still closed the comparison
    // view even though nothing was reset.
    const onReset = vi.fn().mockResolvedValue(false);
    const { onToggleBuiltIn } = renderPanes({ showBuiltIn: true, onReset });

    fireEvent.click(screen.getByLabelText("Reset to default"));

    expect(onReset).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(onToggleBuiltIn).not.toHaveBeenCalled();
    });
  });

  it("keeps the override framing when the override is edited to empty", () => {
    // Regression: the framing used to key off `value` (server content), so
    // editing an override down to "" — or a debounced save("") echo — reverted
    // the pane to its built-in framing mid-edit. `hasOverride` is latched.
    renderPanes({ value: "", hasOverride: true });

    expect(screen.getByText("Your override")).toBeTruthy();
    expect(screen.queryByText(/start typing to customize/)).toBeNull();
    expect(screen.getAllByTestId("editor")).toHaveLength(1);
  });

  describe("no override yet", () => {
    it("seeds the editor with the default and invites typing", () => {
      renderPanes({ value: "", hasOverride: false });

      // The default is the editor's starting text — editable, so typing forks
      // it. No override chrome (reveal toggle, reset) until it does.
      expect(editorValues()).toStrictEqual(["SHIPPED DEFAULT"]);
      expect(
        screen.getAllByTestId("editor")[0]?.getAttribute("data-readonly"),
      ).toBe("false");
      expect(
        screen.getByText("Default — start typing to customize"),
      ).toBeTruthy();
      expect(screen.queryByText("Your override")).toBeNull();
      expect(screen.queryByText("Show default")).toBeNull();
      expect(screen.queryByLabelText("Reset to default")).toBeNull();
    });

    it("still seeds from a stored override before the latch settles", () => {
      // `hasOverride` is latched from an effect, so it reads false on the render
      // where a stored override first mounts the editor. Seeding is content-
      // derived precisely so that render doesn't show the built-in instead of
      // the user's saved text — nothing remounts afterwards to correct it.
      renderPanes({ value: "MY OVERRIDE", hasOverride: false });

      expect(editorValues()).toStrictEqual(["MY OVERRIDE"]);
    });

    it("forks the built-in on the first edit", () => {
      const { onBeginOverride, onChange } = renderPanes({
        value: "",
        hasOverride: false,
      });

      fireEvent.input(screen.getByTestId("editor"), {
        target: { value: "SHIPPED DEFAULT!" },
      });

      // The fork is the latch plus the ordinary autosave of the edited text —
      // the editor already holds the default, so no separate write is needed.
      expect(onBeginOverride).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith("SHIPPED DEFAULT!");
    });

    it("keeps the editor mounted across the fork", () => {
      // The load-bearing property of the single-tree layout: the render that
      // flips `hasOverride` must reuse the editor instance, or it would remount
      // (re-seeding from the built-in) and swallow the keystroke that forked it.
      const { rerenderPanes } = renderPanes({ value: "", hasOverride: false });
      const before = screen.getByTestId("editor");

      fireEvent.input(before, { target: { value: "SHIPPED DEFAULT!" } });
      // The parent latches the override; its `value` catches up only after the
      // debounced save round-trips, so it is still the pre-fork "" here.
      rerenderPanes({ value: "", hasOverride: true });

      expect(screen.getByTestId("editor")).toBe(before);
      expect(editorValues()).toStrictEqual(["SHIPPED DEFAULT!"]);
      // ...and the chrome has switched over.
      expect(screen.getByText("Your override")).toBeTruthy();
      expect(screen.getByLabelText("Reset to default")).toBeTruthy();
    });

    it("re-seeds when the built-in changes under an un-forked pane", () => {
      // The built-in can change server-side (e.g. the notation switch retuning
      // a fragment, picked up by the 5s poll). Nothing is at stake in the
      // un-forked pane, and forking must start from the fresh default.
      const { rerenderPanes } = renderPanes({ value: "", hasOverride: false });

      rerenderPanes({ value: "", hasOverride: false, builtIn: "RETUNED" });

      expect(editorValues()).toStrictEqual(["RETUNED"]);
    });

    it("keeps the user's text when the built-in changes after a fork", () => {
      // The same poll must NOT re-seed once the pane holds the user's own work.
      const { rerenderPanes } = renderPanes({ value: "", hasOverride: false });

      fireEvent.input(screen.getByTestId("editor"), {
        target: { value: "MINE" },
      });
      rerenderPanes({ value: "MINE", hasOverride: true, builtIn: "RETUNED" });

      expect(editorValues()).toStrictEqual(["MINE"]);
    });
  });
});
