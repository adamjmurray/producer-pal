// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsScreen } from "#webui/components/context/skills/SkillsScreen";
import {
  type SkillOverridesStatus,
  type UseSkillOverridesReturn,
} from "#webui/hooks/context/use-skill-overrides";
import { slot } from "./skill-slot-test-helpers";

// Stub the CodeMirror editor to a textarea seeded with the override, so tests
// can drive onChange/onBlur (the autosave path) without CodeMirror.
vi.mock(import("#webui/components/context/MarkdownEditor"), () => ({
  MarkdownEditor: (props: {
    initialValue: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
  }) => (
    <textarea
      data-testid="editor"
      defaultValue={props.initialValue}
      onInput={(event) =>
        props.onChange((event.currentTarget as HTMLTextAreaElement).value)
      }
      onBlur={props.onBlur}
    />
  ),
}));

// Stub the preview screen (it fetches on mount) to a marker that still renders
// the view toggle, so the Fragments/Preview switch is exercised without network.
vi.mock(import("#webui/components/context/skills/SkillsPreviewScreen"), () => ({
  SkillsPreviewScreen: (props: { viewSlot: preact.JSX.Element }) => (
    <div data-testid="preview-screen">{props.viewSlot}</div>
  ),
}));

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

/**
 * Build a skills-overrides hook return with the given status.
 * @param status - The collection status
 * @param over - Extra fields (e.g. spies for save/reset)
 * @returns A hook return stub
 */
function overrides(
  status: SkillOverridesStatus,
  over: Partial<UseSkillOverridesReturn> = {},
): UseSkillOverridesReturn {
  return {
    status,
    saveStatus: "idle",
    saveError: null,
    saveSlot: vi.fn().mockResolvedValue(true),
    resetSlot: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/**
 * The seeded values of the currently-rendered editors (the textarea mock), in
 * DOM order. When the built-in is revealed there are two: the override, then the
 * read-only built-in.
 * @returns Each editor's value
 */
function editorValues(): string[] {
  return screen
    .getAllByTestId("editor")
    .map((editor) => (editor as HTMLTextAreaElement).value);
}

describe("SkillsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading message while the slots load", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "loading" })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByText("Loading skills…")).toBeTruthy();
    expect(screen.getByTestId("tabs")).toBeTruthy();
  });

  it("shows the error message when the load fails", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "error", message: "kaboom" })}
        tabSlot={TAB_SLOT}
      />,
    );

    // Shown in the body and echoed by the header save indicator (as the doc
    // tabs do), so assert presence rather than a single match.
    expect(screen.getAllByText("kaboom").length).toBeGreaterThan(0);
  });

  it("shows an empty message when there are no slots", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "ready", slots: [] })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByText("No skills fragments available.")).toBeTruthy();
  });

  it("shows the built-in with a Customize button for an untracked slot", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "ready", slots: [slot()] })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    // With no override the built-in is the sole (read-only) content, offered
    // with a Customize fork — no editable pane, reveal toggle, reset, or drift.
    expect(editorValues()).toContain("BUILT-IN");
    expect(screen.getByText("Customize")).toBeTruthy();
    expect(screen.queryByText("Show default")).toBeNull();
    expect(screen.queryByLabelText("Reset to default")).toBeNull();
    expect(screen.queryByText(/Default changed since you forked/)).toBeNull();
    // Import/Export are available per-fragment even when there's no override.
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("forks the built-in into an override when Customize is clicked", async () => {
    const saveSlot = vi.fn().mockResolvedValue(true);

    render(
      <SkillsScreen
        overrides={overrides(
          {
            kind: "ready",
            slots: [slot({ builtIn: "FORK-ME", override: "" })],
          },
          { saveSlot },
        )}
        tabSlot={TAB_SLOT}
      />,
    );

    fireEvent.click(screen.getByText("Customize"));

    await waitFor(() => {
      expect(saveSlot).toHaveBeenCalledWith("barbeat-standard", "FORK-ME");
    });
  });

  it("shows the selected slot's one-line explainer", () => {
    render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [slot({ description: "Explains what this fragment does." })],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByText("Explains what this fragment does.")).toBeTruthy();
  });

  it("shows a drift note for a drifted slot", () => {
    render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [
            slot({
              override: "MINE",
              drifted: true,
              forkedFromVersion: "1.4.0",
            }),
          ],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    const note = screen.getByText(/Default changed since you forked/);

    expect(note.textContent).toContain("v1.4.0");
  });

  it("omits the version from the drift note when provenance is unknown", () => {
    render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [
            slot({ override: "MINE", drifted: true, forkedFromVersion: null }),
          ],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    const note = screen.getByText(/Default changed since you forked/);

    expect(note.textContent).not.toContain("(v");
  });

  it("surfaces an external-update banner when the override changes under a clean draft", () => {
    const { rerender } = render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [slot({ override: "" })],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    // An external write (hand edit / device) changes the same slot's override.
    rerender(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [slot({ override: "EXTERNAL" })],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(
      screen.getByText("This skill fragment was updated outside the editor."),
    ).toBeTruthy();
  });

  it("resets a customized slot after confirmation", async () => {
    const resetSlot = vi.fn().mockResolvedValue(true);

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    render(
      <SkillsScreen
        overrides={overrides(
          { kind: "ready", slots: [slot({ override: "MINE" })] },
          { resetSlot },
        )}
        tabSlot={TAB_SLOT}
      />,
    );

    // Reset lives in the revealed built-in header, so surface it first.
    fireEvent.click(screen.getByText("Show default"));
    fireEvent.click(screen.getByLabelText("Reset to default"));

    await waitFor(() => {
      expect(resetSlot).toHaveBeenCalledWith("barbeat-standard");
    });
  });

  it("keeps the built-in revealed and the override intact when the reset is cancelled", async () => {
    // Regression: cancelling the reset confirm used to still collapse the
    // built-in reveal, as if the reset had gone through.
    const resetSlot = vi.fn().mockResolvedValue(true);

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    render(
      <SkillsScreen
        overrides={overrides(
          { kind: "ready", slots: [slot({ override: "MINE" })] },
          { resetSlot },
        )}
        tabSlot={TAB_SLOT}
      />,
    );

    fireEvent.click(screen.getByText("Show default"));
    fireEvent.click(screen.getByLabelText("Reset to default"));

    await waitFor(() => {
      expect(resetSlot).not.toHaveBeenCalled();
    });
    // The comparison view stays open — nothing was reset.
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("autosaves the override on edit + blur", async () => {
    const saveSlot = vi.fn().mockResolvedValue(true);

    render(
      <SkillsScreen
        overrides={overrides(
          { kind: "ready", slots: [slot({ override: "MINE" })] },
          { saveSlot },
        )}
        tabSlot={TAB_SLOT}
      />,
    );

    const editor = screen.getByTestId("editor");

    fireEvent.input(editor, { target: { value: "MY OVERRIDE" } });
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(saveSlot).toHaveBeenCalledWith("barbeat-standard", "MY OVERRIDE");
    });
  });

  it("switches slots via the dropdown", () => {
    render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [
            slot({ name: "barbeat-standard", title: "Core", builtIn: "CORE" }),
            slot({ name: "stark", title: "Stark", builtIn: "STARK" }),
          ],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    // Untracked slots show their built-in directly (built-in-only view).
    expect(editorValues()).toContain("CORE");

    fireEvent.change(screen.getByLabelText("Skill fragment"), {
      target: { value: "stark" },
    });

    // Switching slots remounts the screen and re-seeds from the new slot.
    expect(editorValues()).toContain("STARK");
  });

  it("toggles between the fragment editor and the preview", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "ready", slots: [slot()] })}
        tabSlot={TAB_SLOT}
      />,
    );

    // Fragments view by default: the slot dropdown is present.
    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.queryByTestId("preview-screen")).toBeNull();

    fireEvent.click(screen.getByText("Preview"));

    expect(screen.getByTestId("preview-screen")).toBeTruthy();
    expect(screen.queryByLabelText("Skill fragment")).toBeNull();

    // The toggle is still reachable inside the preview screen; switch back.
    fireEvent.click(screen.getByText("Fragments"));

    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
  });

  it("keeps the preview reachable while the fragments list is loading", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "loading" })}
        tabSlot={TAB_SLOT}
      />,
    );

    fireEvent.click(screen.getByText("Preview"));

    expect(screen.getByTestId("preview-screen")).toBeTruthy();
  });

  describe("copy built-in", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeText = vi.fn();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("copies the built-in to the clipboard", () => {
      render(
        <SkillsScreen
          overrides={overrides({
            kind: "ready",
            slots: [slot({ builtIn: "COPY-ME", override: "MINE" })],
          })}
          tabSlot={TAB_SLOT}
        />,
      );

      fireEvent.click(screen.getByText("Show default"));
      fireEvent.click(screen.getByText("Copy"));

      expect(writeText).toHaveBeenCalledWith("COPY-ME");
    });
  });
});
