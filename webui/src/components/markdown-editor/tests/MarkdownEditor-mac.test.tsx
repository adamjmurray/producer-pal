// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { EditorView } from "@codemirror/view";
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "#webui/components/markdown-editor/MarkdownEditor";

// CodeMirror reads the platform once at import, so stub before it loads.
vi.hoisted(() => {
  Object.defineProperty(navigator, "platform", { value: "MacIntel" });
});

describe("MarkdownEditor on macOS", () => {
  it("Ctrl-m enters Tab-focus mode (defaultKeymap's Alt-Shift-m never matches)", () => {
    const { container } = render(
      <MarkdownEditor initialValue="hello" onChange={() => {}} />,
    );
    const view = EditorView.findFromDOM(container as HTMLElement)!;

    // What macOS actually reports for Option+Shift+M on a US layout.
    fireEvent.keyDown(view.contentDOM, {
      key: "Í",
      keyCode: 77,
      altKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(view.contentDOM, { key: "Tab", keyCode: 9 });
    expect(view.state.doc.toString()).toBe("  hello");

    fireEvent.keyDown(view.contentDOM, { key: "m", ctrlKey: true });
    const notPrevented = fireEvent.keyDown(view.contentDOM, {
      key: "Tab",
      keyCode: 9,
    });

    expect(notPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("  hello");
  });
});
