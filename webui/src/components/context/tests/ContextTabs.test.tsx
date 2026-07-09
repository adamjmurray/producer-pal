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

    const projectTab = screen.getByRole("button", { name: "Project" });

    expect(projectTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("PROJECT-DOC");
  });

  it("switches to the Global tab and shows the global document", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Global" }));

    const globalTab = screen.getByRole("button", { name: "Global" });

    expect(globalTab.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Project" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByTestId("editor").textContent).toBe("GLOBAL-DOC");
  });

  it("switches to the Instructions tab, shows the custom prompt doc and its full-replace note", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    expect(
      screen
        .getByRole("button", { name: "Instructions" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("INSTRUCTIONS-DOC");
    // The controls strip warns that this document replaces the built-in prompt.
    expect(screen.getByText(/fully replaces/i)).toBeTruthy();
    // The override pane is labelled; the shipped default is hidden until asked
    // for, then renders read-only so users can fork it.
    expect(screen.getByText("Your instructions")).toBeTruthy();
    expect(screen.queryByText(/ai music composition assistant/i)).toBeNull();

    fireEvent.click(screen.getByText("Show built-in"));
    expect(screen.getByText(/ai music composition assistant/i)).toBeTruthy();
  });

  it("switches back to the Project tab", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Global" }));
    fireEvent.click(screen.getByRole("button", { name: "Project" }));

    expect(
      screen
        .getByRole("button", { name: "Project" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("PROJECT-DOC");
  });

  it("switches to the Skills tab and shows the fragment editor", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));

    expect(
      screen
        .getByRole("button", { name: "Skills" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // The slot dropdown renders; with no override the built-in shows directly,
    // read-only, offered with a Customize fork.
    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.getByText("CORE-BUILTIN")).toBeTruthy();
    expect(screen.getByText("Customize")).toBeTruthy();
  });

  it("switches to the Memory tab and shows the collection manager", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Memory" }));

    expect(
      screen
        .getByRole("button", { name: "Memory" })
        .getAttribute("aria-pressed"),
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
