// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyFocusChange } from "#webui/components/markdown-editor/markdown-editor-helpers";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "#webui/components/markdown-editor/MarkdownEditor";

type EditorProps = Partial<Parameters<typeof MarkdownEditor>[0]>;

function renderEditor(props: EditorProps = {}) {
  return render(
    <MarkdownEditor
      initialValue="x"
      readOnly={false}
      onChange={() => {}}
      {...props}
    />,
  );
}

/**
 * The live EditorView behind a rendered editor.
 * @param container - The render container
 * @returns The view
 */
function viewIn(container: Element): EditorView {
  return EditorView.findFromDOM(container as HTMLElement)!;
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
    const view = viewIn(container);

    view.dispatch({ changes: { from: 2, insert: " there" } });

    expect(onChange).toHaveBeenCalledWith("hi there");
  });

  it("indents the current line with Tab and outdents with Shift+Tab", () => {
    const { container } = renderEditor({ initialValue: "hello" });
    const view = viewIn(container);

    fireEvent.keyDown(view.contentDOM, { key: "Tab" });
    expect(view.state.doc.toString()).toBe("  hello");

    fireEvent.keyDown(view.contentDOM, { key: "Tab", shiftKey: true });
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("read-only lets Tab move focus instead of trapping it", () => {
    const { container } = renderEditor({
      initialValue: "hello",
      readOnly: true,
    });
    const view = viewIn(container);

    const notPrevented = fireEvent.keyDown(view.contentDOM, { key: "Tab" });

    expect(notPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("indents and outdents every line of a multi-line selection", () => {
    const { container } = renderEditor({ initialValue: "one\ntwo\nthree" });
    const view = viewIn(container);

    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

    fireEvent.keyDown(view.contentDOM, { key: "Tab" });
    expect(view.state.doc.toString()).toBe("  one\n  two\n  three");

    fireEvent.keyDown(view.contentDOM, { key: "Tab", shiftKey: true });
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");
  });

  it("shows the placeholder while empty and follows prop changes", () => {
    const { container, rerender } = renderEditor({
      initialValue: "",
      placeholder: "Type here",
    });

    expect(container.querySelector(".cm-placeholder")?.textContent).toBe(
      "Type here",
    );

    rerender(
      <MarkdownEditor
        initialValue=""
        onChange={() => {}}
        placeholder="Busy…"
      />,
    );

    expect(container.querySelector(".cm-placeholder")?.textContent).toBe(
      "Busy…",
    );
  });

  it("disabled turns off contenteditable and dims the frame", () => {
    const { container, rerender } = renderEditor({ disabled: true });
    const content = container.querySelector(".cm-content")!;

    expect(content.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelector(".opacity-50")).toBeTruthy();

    rerender(
      <MarkdownEditor initialValue="x" onChange={() => {}} disabled={false} />,
    );

    expect(content.getAttribute("contenteditable")).toBe("true");
    expect(container.querySelector(".opacity-50")).toBeFalsy();
  });

  it("read-only keeps contenteditable so the preview stays focusable", () => {
    const { container } = renderEditor({ readOnly: true });
    const view = viewIn(container);

    expect(
      container.querySelector(".cm-content")?.getAttribute("contenteditable"),
    ).toBe("true");
    expect(view.state.readOnly).toBe(true);
  });

  it("chat variant turns spellcheck and autocorrect back on", () => {
    const { container: chat } = renderEditor({ variant: "chat" });
    const { container: card } = renderEditor({ variant: "card" });

    expect(viewIn(chat).contentDOM.getAttribute("spellcheck")).toBe("true");
    expect(viewIn(chat).contentDOM.getAttribute("autocorrect")).toBe("on");
    expect(viewIn(card).contentDOM.getAttribute("spellcheck")).toBe("false");
  });

  it("uses the chat frame for the chat variant", () => {
    const { container } = renderEditor({ variant: "chat" });

    expect(container.querySelector(".shadow-inner")).toBeTruthy();
    expect(container.querySelector(".rounded-md")).toBeFalsy();
  });

  it("exposes clear() and focus() through editorRef", () => {
    const editorRef: { current: MarkdownEditorHandle | null } = {
      current: null,
    };
    const onChange = vi.fn();
    const { container, unmount } = renderEditor({
      initialValue: "draft",
      onChange,
      editorRef,
    });
    const view = viewIn(container);

    editorRef.current!.focus();
    expect(view.hasFocus).toBe(true);

    editorRef.current!.clear();
    expect(view.state.doc.toString()).toBe("");
    expect(onChange).toHaveBeenCalledWith("");
    expect(view.hasFocus).toBe(true);

    // Undo must not resurrect a sent message.
    undo(view);
    expect(view.state.doc.toString()).toBe("");

    unmount();
    expect(editorRef.current).toBeNull();
  });

  it("reports focus and blur through the update listener", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { container } = renderEditor({ onFocus, onBlur });
    const view = viewIn(container);

    view.contentDOM.focus();
    view.dispatch({ userEvent: "select" });

    // Checked here rather than at the end: "both were called" passes just as
    // well with the two callbacks wired to the wrong event.
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).not.toHaveBeenCalled();

    view.contentDOM.blur();
    view.dispatch({ userEvent: "select" });

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});

describe("MarkdownEditor onSubmit", () => {
  it("Enter calls the latest onSubmit instead of inserting a newline", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = renderEditor({
      initialValue: "hi",
      onSubmit: first,
    });
    const view = viewIn(container);

    rerender(
      <MarkdownEditor
        initialValue="hi"
        onChange={() => {}}
        onSubmit={second}
      />,
    );
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("hi");
  });

  it("Shift+Enter inserts a newline and continues a list", () => {
    const onSubmit = vi.fn();
    const { container } = renderEditor({
      initialValue: "- one",
      onSubmit,
    });
    const view = viewIn(container);

    view.dispatch({ selection: { anchor: 5 } });
    fireEvent.keyDown(view.contentDOM, { key: "Enter", shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("- one\n- ");
  });

  it("Shift+Enter outside a list inserts a plain newline", () => {
    const { container } = renderEditor({
      initialValue: "hi",
      onSubmit: () => {},
    });
    const view = viewIn(container);

    view.dispatch({ selection: { anchor: 2 } });
    fireEvent.keyDown(view.contentDOM, { key: "Enter", shiftKey: true });

    expect(view.state.doc.toString()).toBe("hi\n");
  });

  it("Enter with Cmd, Ctrl, or Alt still submits, like the old textarea", () => {
    const onSubmit = vi.fn();
    const { container } = renderEditor({ initialValue: "hi", onSubmit });
    const view = viewIn(container);

    fireEvent.keyDown(view.contentDOM, { key: "Enter", metaKey: true });
    fireEvent.keyDown(view.contentDOM, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(view.contentDOM, { key: "Enter", altKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(3);
    expect(view.state.doc.toString()).toBe("hi");
  });

  it("without onSubmit, Enter continues a list like the context editors", () => {
    const { container } = renderEditor({ initialValue: "- one" });
    const view = viewIn(container);

    view.dispatch({ selection: { anchor: 5 } });
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });

    expect(view.state.doc.toString()).toBe("- one\n- ");
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
