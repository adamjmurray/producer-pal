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

vi.mock(import("#webui/hooks/context/use-system-prompt-memory"), () => ({
  useSystemPromptMemory: () => readyMemory("INSTRUCTIONS-DOC"),
}));

vi.mock(import("#webui/hooks/context/use-skill-overrides"), () => ({
  useSkillOverrides: () => ({
    status: {
      kind: "ready",
      slots: [
        {
          name: "barbeat-standard",
          title: "Core (standard)",
          description: "Slot description.",
          builtIn: "CORE-BUILTIN",
          override: "",
          drifted: false,
          forkedFromVersion: null,
        },
      ],
    },
    saveStatus: "idle",
    saveError: null,
    saveSlot: vi.fn(),
    resetSlot: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock(import("#webui/hooks/context/use-memory-collection"), () => ({
  useMemoryCollection: () => ({
    status: {
      kind: "ready",
      entries: [
        {
          name: "prefers-c-minor",
          type: "user",
          description: "default key & genre",
          body: "Composes in C minor.",
        },
      ],
    },
    saveStatus: "idle",
    saveError: null,
    saveEntry: vi.fn(),
    deleteEntry: vi.fn(),
    refresh: vi.fn(),
  }),
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

  it("switches to the Instructions tab, shows the custom prompt doc and its full-replace note", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Instructions" }));

    expect(
      screen
        .getByRole("tab", { name: "Instructions" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("INSTRUCTIONS-DOC");
    // The controls strip warns that this document replaces the built-in prompt.
    expect(screen.getByText(/fully replaces/i)).toBeTruthy();
    // The shipped default renders read-only beside the editor so users can fork
    // it instead of starting from a blank slate.
    expect(screen.getByText("Your instructions")).toBeTruthy();
    expect(screen.getByText(/ai music composition assistant/i)).toBeTruthy();
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

  it("switches to the Skills tab and shows the fragment editor", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    expect(
      screen.getByRole("tab", { name: "Skills" }).getAttribute("aria-selected"),
    ).toBe("true");
    // The slot dropdown and the read-only built-in pane render.
    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.getByText("CORE-BUILTIN")).toBeTruthy();
  });

  it("switches to the Memory tab and shows the collection manager", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));

    expect(
      screen.getByRole("tab", { name: "Memory" }).getAttribute("aria-selected"),
    ).toBe("true");
    // The list shows the stored memory and the create form is available.
    expect(
      screen.getByRole("button", { name: /prefers-c-minor/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
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
