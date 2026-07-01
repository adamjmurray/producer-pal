// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ContextTabs } from "#webui/components/context/ContextTabs";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";

// The MarkdownEditor wires CodeMirror; stub it to a plain node that echoes the
// seeded initialValue so we can assert which document the active tab shows.
vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: { initialValue: string }) => (
    <div data-testid="editor">{props.initialValue}</div>
  ),
}));

/**
 * Build a ready document-memory value with the given content.
 * @param content - The document body the editor should seed from
 * @returns A UseDocMemoryReturn stub
 */
function readyMemory(content: string): UseDocMemoryReturn {
  return {
    status: { kind: "ready", content },
    saveStatus: "idle",
    saveError: null,
    save: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock(import("#webui/hooks/context/use-context-memory"), () => ({
  useContextMemory: () => readyMemory("PROJECT-DOC"),
}));

vi.mock(import("#webui/hooks/context/use-global-context-memory"), () => ({
  useGlobalContextMemory: () => readyMemory("GLOBAL-DOC"),
}));

describe("ContextTabs", () => {
  it("defaults to the Project tab and shows the project document", () => {
    render(<ContextTabs />);

    const projectTab = screen.getByRole("tab", { name: "Project" });

    expect(projectTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("PROJECT-DOC");
  });

  it("switches to the Global tab and shows the global document", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Global" }));

    const globalTab = screen.getByRole("tab", { name: "Global" });

    expect(globalTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Project" })
        .getAttribute("aria-selected"),
    ).toBe("false");
    expect(screen.getByTestId("editor").textContent).toBe("GLOBAL-DOC");
  });

  it("switches back to the Project tab", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Global" }));
    fireEvent.click(screen.getByRole("tab", { name: "Project" }));

    expect(
      screen
        .getByRole("tab", { name: "Project" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("PROJECT-DOC");
  });

  it("renders a close button that calls onClose", () => {
    const onClose = vi.fn();

    render(<ContextTabs onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close context editor"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits the close button when onClose is not provided", () => {
    render(<ContextTabs />);

    expect(screen.queryByLabelText("Close context editor")).toBeNull();
  });
});
