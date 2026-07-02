// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsScreen } from "#webui/components/context/SkillsScreen";
import {
  type SkillOverridesStatus,
  type SkillSlotView,
  type UseSkillOverridesReturn,
} from "#webui/hooks/context/use-skill-overrides";

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

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

/**
 * Build a slot view with overridable fields.
 * @param over - Fields to override on the default slot
 * @returns A slot view
 */
function slot(over: Partial<SkillSlotView> = {}): SkillSlotView {
  return {
    name: "core-standard",
    title: "Core (standard)",
    description: "Slot description.",
    builtIn: "BUILT-IN",
    override: "",
    drifted: false,
    forkedFromVersion: null,
    ...over,
  };
}

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

  it("renders the first slot's built-in and override, hiding reset when untracked", () => {
    render(
      <SkillsScreen
        overrides={overrides({ kind: "ready", slots: [slot()] })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.getByText("BUILT-IN")).toBeTruthy();
    expect(screen.queryByText("Reset to default")).toBeNull();
    expect(screen.queryByText(/Built-in changed since you forked/)).toBeNull();
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

    const note = screen.getByText(/Built-in changed since you forked/);

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

    const note = screen.getByText(/Built-in changed since you forked/);

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

    fireEvent.click(screen.getByText("Reset to default"));

    await waitFor(() => {
      expect(resetSlot).toHaveBeenCalledWith("core-standard");
    });
  });

  it("autosaves the override on edit + blur", async () => {
    const saveSlot = vi.fn().mockResolvedValue(true);

    render(
      <SkillsScreen
        overrides={overrides({ kind: "ready", slots: [slot()] }, { saveSlot })}
        tabSlot={TAB_SLOT}
      />,
    );

    const editor = screen.getByTestId("editor");

    fireEvent.input(editor, { target: { value: "MY OVERRIDE" } });
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(saveSlot).toHaveBeenCalledWith("core-standard", "MY OVERRIDE");
    });
  });

  it("switches slots via the dropdown", () => {
    render(
      <SkillsScreen
        overrides={overrides({
          kind: "ready",
          slots: [
            slot({ name: "core-standard", title: "Core", builtIn: "CORE" }),
            slot({ name: "stark", title: "Stark", builtIn: "STARK" }),
          ],
        })}
        tabSlot={TAB_SLOT}
      />,
    );

    expect(screen.getByText("CORE")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Skill fragment"), {
      target: { value: "stark" },
    });

    expect(screen.getByText("STARK")).toBeTruthy();
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
            slots: [slot({ builtIn: "COPY-ME" })],
          })}
          tabSlot={TAB_SLOT}
        />,
      );

      fireEvent.click(screen.getByText("Copy"));

      expect(writeText).toHaveBeenCalledWith("COPY-ME");
    });
  });
});
