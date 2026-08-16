// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { EditorView } from "@codemirror/view";
import { fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyFocusChange } from "#webui/components/markdown-editor/markdown-editor-helpers";
import { MarkdownEditor } from "#webui/components/markdown-editor/MarkdownEditor";

type EditorProps = Partial<{
  initialValue: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  className: string;
}>;

function renderEditor(props: EditorProps = {}) {
  return render(
    <MarkdownEditor
      initialValue={props.initialValue ?? "x"}
      readOnly={props.readOnly ?? false}
      onChange={props.onChange ?? (() => {})}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      className={props.className}
    />,
  );
}

describe("MarkdownEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial value", () => {
    const { container } = renderEditor({ initialValue: "# hello" });

    expect(container.textContent).toContain("hello");
  });

  it("renders bulleted markers as • but leaves ordered markers alone", () => {
    const { container } = renderEditor({
      initialValue: "- one\n* two\n+ three\n1. first",
    });

    // Each of the three bullet styles is replaced by a • widget…
    expect(container.querySelectorAll(".cm-bullet-marker")).toHaveLength(3);
    // …while the ordered marker's digit survives verbatim.
    expect(container.textContent).toContain("1.");
  });

  it("ignores initialValue prop changes after mount (uncontrolled)", () => {
    const { container, rerender } = renderEditor({ initialValue: "first" });

    expect(container.textContent).toContain("first");

    // The editor is uncontrolled — subsequent prop changes are intentionally
    // ignored so server echoes / AI writes can't clobber an in-progress draft
    // (and so a normalization mismatch can't trigger a dispatch loop).
    rerender(
      <MarkdownEditor
        initialValue="second"
        readOnly={false}
        onChange={() => {}}
      />,
    );

    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("second");
  });

  it("destroys the EditorView on unmount", () => {
    const { container, unmount } = renderEditor({ initialValue: "bye" });

    expect(container.querySelector(".cm-editor")).toBeTruthy();
    unmount();
    expect(container.querySelector(".cm-editor")).toBeFalsy();
  });

  it("renders without crashing in read-only mode", () => {
    const { container } = renderEditor({ readOnly: true });

    expect(container.querySelector(".cm-editor")).toBeTruthy();
  });

  it("does not crash when toggling readOnly", () => {
    const { container, rerender } = renderEditor({ readOnly: true });

    rerender(
      <MarkdownEditor initialValue="x" readOnly={false} onChange={() => {}} />,
    );

    expect(container.querySelector(".cm-editor")).toBeTruthy();
  });

  it("attaches a className to the frame element", () => {
    const { container } = renderEditor({ className: "custom-host" });

    expect(container.querySelector(".custom-host")).toBeTruthy();
  });

  it("reports the new document text when the editor state changes", () => {
    // happy-dom won't drive contenteditable, so reach the live EditorView and
    // dispatch a transaction — the same path a real keystroke takes.
    const onChange = vi.fn();
    const { container } = renderEditor({ initialValue: "hi", onChange });
    const view = EditorView.findFromDOM(container as HTMLElement)!;

    view.dispatch({ changes: { from: 2, insert: " there" } });

    expect(onChange).toHaveBeenCalledWith("hi there");
  });

  it("indents the current line with Tab and outdents with Shift+Tab", () => {
    const { container } = renderEditor({ initialValue: "hello" });
    const view = EditorView.findFromDOM(container as HTMLElement)!;

    fireEvent.keyDown(view.contentDOM, { key: "Tab" });
    expect(view.state.doc.toString()).toBe("  hello");

    fireEvent.keyDown(view.contentDOM, { key: "Tab", shiftKey: true });
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("indents and outdents every line of a multi-line selection", () => {
    const { container } = renderEditor({ initialValue: "one\ntwo\nthree" });
    const view = EditorView.findFromDOM(container as HTMLElement)!;

    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

    fireEvent.keyDown(view.contentDOM, { key: "Tab" });
    expect(view.state.doc.toString()).toBe("  one\n  two\n  three");

    fireEvent.keyDown(view.contentDOM, { key: "Tab", shiftKey: true });
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");
  });

  it("reports focus and blur through the update listener", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { container } = renderEditor({ onFocus, onBlur });
    const view = EditorView.findFromDOM(container as HTMLElement)!;

    view.contentDOM.focus();
    view.dispatch({ userEvent: "select" });
    view.contentDOM.blur();
    view.dispatch({ userEvent: "select" });

    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});

describe("notifyFocusChange", () => {
  it("calls onFocus when hasFocus is true", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();

    notifyFocusChange(true, onFocus, onBlur);

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).not.toHaveBeenCalled();
  });

  it("calls onBlur when hasFocus is false", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();

    notifyFocusChange(false, onFocus, onBlur);

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("is a no-op when callbacks are undefined", () => {
    expect(() => {
      notifyFocusChange(true, undefined, undefined);
      notifyFocusChange(false, undefined, undefined);
    }).not.toThrow();
  });
});
