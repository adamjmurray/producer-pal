// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextTabs } from "#webui/components/context/ContextTabs";
import { type UseDocReturn } from "#webui/hooks/context/use-doc";

// The MarkdownEditor wires CodeMirror; stub it to a plain node that echoes the
// seeded initialValue so we can assert which document the active tab shows.
vi.mock(import("#webui/components/markdown-editor/MarkdownEditor"), () => ({
  MarkdownEditor: (props: { initialValue: string }) => (
    <div data-testid="editor">{props.initialValue}</div>
  ),
}));

/**
 * Build a ready doc value with the given content.
 * @param content - The document body the editor should seed from
 * @returns A UseDocReturn stub
 */
function readyDoc(content: string): UseDocReturn {
  return {
    status: { kind: "ready", content },
    saveStatus: "idle",
    saveError: null,
    save: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock(import("#webui/hooks/context/use-project-context"), () => ({
  useProjectContext: () => readyDoc("PROJECT-DOC"),
}));

vi.mock(import("#webui/hooks/context/use-global-context"), () => ({
  useGlobalContext: () => readyDoc("GLOBAL-DOC"),
}));

vi.mock(import("#webui/hooks/context/use-system-prompt"), () => ({
  useSystemPrompt: () => readyDoc("INSTRUCTIONS-DOC"),
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
          enabled: true,
          canDisable: true,
          gate: null,
          drifted: false,
          splitStale: null,
          forkedFromVersion: null,
        },
      ],
    },
    saveStatus: "idle",
    saveError: null,
    saveSlot: vi.fn(),
    setSlotEnabled: vi.fn(),
    resetSlot: vi.fn(),
    refresh: vi.fn(),
    resetSaveStatus: vi.fn(),
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
    renameEntry: vi.fn(),
    deleteEntry: vi.fn(),
    resetSaveStatus: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("switches to the Instructions tab, shows the custom prompt doc and its scope note", () => {
    render(<ContextTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    expect(
      screen
        .getByRole("button", { name: "Instructions" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("editor").textContent).toBe("INSTRUCTIONS-DOC");
    // The controls strip explains only Producer Pal's own chat uses this prompt.
    expect(screen.getByText(/only that chat uses it/i)).toBeTruthy();
    // The override pane is labelled; the shipped default is hidden until asked
    // for, then renders read-only so users can fork it.
    expect(screen.getByText("Your instructions")).toBeTruthy();
    expect(screen.queryByText(/ai music composition assistant/i)).toBeNull();

    fireEvent.click(screen.getByText("Show default"));
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
    // The slot dropdown renders; with no override the built-in seeds the
    // editor directly, labelled as the fork invitation.
    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.getByText("CORE-BUILTIN")).toBeTruthy();
    expect(
      screen.getByText("Default — start typing to customize"),
    ).toBeTruthy();
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
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
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

describe("ContextTabs — leave guard on tab clicks", () => {
  // Arm the new-memory discard guard by typing into the create form's Name.
  const armMemoryDraft = (): void => {
    fireEvent.click(screen.getByRole("button", { name: "Memory" }));
    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "half-typed" },
    });
  };

  it("does NOT prompt a discard when clicking the already-active tab", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    render(<ContextTabs />);

    armMemoryDraft();
    // Clicking the active Memory tab unmounts nothing, so the guard must not run.
    fireEvent.click(screen.getByRole("button", { name: "Memory" }));

    expect(window.confirm).not.toHaveBeenCalled();
    // Still on Memory with the draft intact (the create form is present).
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });

  it("prompts a discard when switching AWAY from a dirty new-memory draft", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    render(<ContextTabs />);

    armMemoryDraft();
    fireEvent.click(screen.getByRole("button", { name: "Project" }));

    // Cancelled discard → stayed on Memory (the guard fired and vetoed).
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });
});

describe("ContextTabs — confirmLeaveRef", () => {
  it("publishes confirmLeave into the ref and clears it on unmount", () => {
    const ref: { current: (() => boolean) | null } = { current: null };
    const { unmount } = render(<ContextTabs confirmLeaveRef={ref} />);

    // The App overlay reads this to guard its Escape / backdrop close paths.
    // With no dirty draft registered, the guard approves leaving.
    expect(typeof ref.current).toBe("function");
    expect(ref.current?.()).toBe(true);

    unmount();
    expect(ref.current).toBeNull();
  });
});
