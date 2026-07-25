// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { type VNode } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsScreen } from "#webui/components/context/skills/SkillsScreen";
import {
  type SkillOverridesStatus,
  type SkillSlotView,
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
// the view toggle, so the Preview/Source switch is exercised without network.
vi.mock(import("#webui/components/context/skills/SkillsPreviewScreen"), () => ({
  SkillsPreviewScreen: (props: { viewSlot: preact.JSX.Element }) => (
    <div data-testid="preview-screen">{props.viewSlot}</div>
  ),
}));

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

// Two selectable slots, for the dropdown slot-switch tests.
const TWO_SLOTS = [
  slot({ name: "barbeat-standard", title: "Core", builtIn: "CORE" }),
  slot({ name: "stark", title: "Stark", builtIn: "STARK" }),
];

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
    setSlotEnabled: vi.fn().mockResolvedValue(true),
    resetSlot: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    resetSaveStatus: vi.fn(),
    ...over,
  };
}

/**
 * Render SkillsScreen for the given overrides status.
 * @param status - The collection status
 * @param over - Extra hook-return fields (e.g. spies for save/reset)
 * @returns rerenderStatus(status), which re-renders with a new status
 */
function renderScreen(
  status: SkillOverridesStatus,
  over: Partial<UseSkillOverridesReturn> = {},
): { rerenderStatus: (status: SkillOverridesStatus) => void } {
  const el = (s: SkillOverridesStatus): VNode => (
    <SkillsScreen overrides={overrides(s, over)} tabSlot={TAB_SLOT} />
  );
  const { rerender } = render(el(status));

  return { rerenderStatus: (s) => rerender(el(s)) };
}

/**
 * Render SkillsScreen ready with the given slots.
 * @param slots - The ready slots
 * @param over - Extra hook-return fields (e.g. spies for save/reset)
 * @returns rerenderSlots(slots), which re-renders with new slots
 */
function renderSlots(
  slots: SkillSlotView[],
  over: Partial<UseSkillOverridesReturn> = {},
): { rerenderSlots: (slots: SkillSlotView[]) => void } {
  const { rerenderStatus } = renderScreen({ kind: "ready", slots }, over);

  return { rerenderSlots: (s) => rerenderStatus({ kind: "ready", slots: s }) };
}

/**
 * Render a customized slot with the reset confirm stubbed, then drive a reset
 * from the revealed built-in header (where the reset control lives).
 * @param confirmed - What the stubbed reset confirm returns
 * @returns The resetSlot spy
 */
function clickResetSlot(confirmed: boolean): {
  resetSlot: ReturnType<typeof vi.fn>;
} {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(confirmed));

  const resetSlot = vi.fn().mockResolvedValue(true);

  renderSlots([slot({ override: "MINE" })], { resetSlot });

  fireEvent.click(screen.getByText("Show default"));
  fireEvent.click(screen.getByLabelText("Reset to default"));

  return { resetSlot };
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
    renderScreen({ kind: "loading" });

    expect(screen.getByText("Loading skills…")).toBeTruthy();
    expect(screen.getByTestId("tabs")).toBeTruthy();
  });

  it("shows the error message when the load fails", () => {
    renderScreen({ kind: "error", message: "kaboom" });

    // Shown in the body and echoed by the header save indicator (as the doc
    // tabs do), so assert presence rather than a single match.
    expect(screen.getAllByText("kaboom").length).toBeGreaterThan(0);
  });

  it("shows an empty message when there are no slots", () => {
    renderSlots([]);

    expect(screen.getByText("No skills fragments available.")).toBeTruthy();
  });

  it("shows the built-in with a Customize button for an untracked slot", () => {
    renderSlots([slot()]);

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

    renderSlots([slot({ builtIn: "FORK-ME", override: "" })], { saveSlot });

    fireEvent.click(screen.getByText("Customize"));

    await waitFor(() => {
      expect(saveSlot).toHaveBeenCalledWith("barbeat-standard", "FORK-ME");
    });
  });

  it("shows the selected slot's one-line explainer", () => {
    renderSlots([slot({ description: "Explains what this fragment does." })]);

    expect(screen.getByText("Explains what this fragment does.")).toBeTruthy();
  });

  it("switches the selected fragment off from the Include checkbox", () => {
    const setSlotEnabled = vi.fn().mockResolvedValue(true);

    renderSlots([slot({ override: "MINE" })], { setSlotEnabled });

    const toggle = screen.getByLabelText("Include") as HTMLInputElement;

    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);

    expect(setSlotEnabled).toHaveBeenCalledWith("barbeat-standard", false);
  });

  it("shows a switched-off fragment unchecked, and marks it in the dropdown", () => {
    renderSlots([slot({ enabled: false })]);

    expect((screen.getByLabelText("Include") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByRole("option").textContent).toContain("✕");
  });

  it("offers no Include toggle for a slot that cannot be switched off", () => {
    // The drivers ARE the document — switching one off would empty the blob.
    renderSlots([slot({ name: "standard", canDisable: false })]);

    expect(screen.queryByLabelText("Include")).toBeNull();
  });

  it("shows a drift note for a drifted slot", () => {
    renderSlots([
      slot({ override: "MINE", drifted: true, forkedFromVersion: "1.4.0" }),
    ]);

    const note = screen.getByText(/Default changed since you forked/);

    expect(note.textContent).toContain("v1.4.0");
  });

  it("omits the version from the drift note when provenance is unknown", () => {
    renderSlots([
      slot({ override: "MINE", drifted: true, forkedFromVersion: null }),
    ]);

    const note = screen.getByText(/Default changed since you forked/);

    expect(note.textContent).not.toContain("(v");
  });

  it("surfaces an external-update banner when the override changes under a clean draft", () => {
    const { rerenderSlots } = renderSlots([slot({ override: "" })]);

    // An external write (hand edit / device) changes the same slot's override.
    rerenderSlots([slot({ override: "EXTERNAL" })]);

    expect(
      screen.getByText("This skill fragment was updated outside the editor."),
    ).toBeTruthy();
  });

  it("resets a customized slot after confirmation", async () => {
    const { resetSlot } = clickResetSlot(true);

    await waitFor(() => {
      expect(resetSlot).toHaveBeenCalledWith("barbeat-standard");
    });
  });

  it("keeps the built-in revealed and the override intact when the reset is cancelled", async () => {
    // Regression: cancelling the reset confirm used to still collapse the
    // built-in reveal, as if the reset had gone through.
    const { resetSlot } = clickResetSlot(false);

    await waitFor(() => {
      expect(resetSlot).not.toHaveBeenCalled();
    });
    // The comparison view stays open — nothing was reset.
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("autosaves the override on edit + blur", async () => {
    const saveSlot = vi.fn().mockResolvedValue(true);

    renderSlots([slot({ override: "MINE" })], { saveSlot });

    const editor = screen.getByTestId("editor");

    fireEvent.input(editor, { target: { value: "MY OVERRIDE" } });
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(saveSlot).toHaveBeenCalledWith("barbeat-standard", "MY OVERRIDE");
    });
  });

  it("switches slots via the dropdown", () => {
    renderSlots(TWO_SLOTS);

    // Untracked slots show their built-in directly (built-in-only view).
    expect(editorValues()).toContain("CORE");

    fireEvent.change(screen.getByLabelText("Skill fragment"), {
      target: { value: "stark" },
    });

    // Switching slots remounts the screen and re-seeds from the new slot.
    expect(editorValues()).toContain("STARK");
  });

  it("resets the save indicator when the edited slot changes", () => {
    // Guards the slot-switch reset effect: without it, a "Saved"/"error" status
    // from the previous slot would bleed onto the next (the overrides hook
    // outlives the per-slot remount). Mirrors the memory editor's entry-switch
    // reset test.
    const resetSaveStatus = vi.fn();

    renderSlots(TWO_SLOTS, { resetSaveStatus });

    // Clear the mount-time reset so the assertion targets the slot switch.
    resetSaveStatus.mockClear();

    fireEvent.change(screen.getByLabelText("Skill fragment"), {
      target: { value: "stark" },
    });

    expect(resetSaveStatus).toHaveBeenCalled();
  });

  it("toggles between the fragment editor and the preview", () => {
    renderSlots([slot()]);

    // Fragments view by default: the slot dropdown is present.
    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
    expect(screen.queryByTestId("preview-screen")).toBeNull();

    // The toggle offers the preview (with its included fragments) and switches.
    const toPreview = screen.getByText("Preview");

    expect(toPreview.getAttribute("title")).toBe(
      "Preview with included fragments inserted",
    );
    fireEvent.click(toPreview);

    expect(screen.getByTestId("preview-screen")).toBeTruthy();
    expect(screen.queryByLabelText("Skill fragment")).toBeNull();

    // Still reachable inside the preview, now offering the raw fragment source.
    const toSource = screen.getByText("Source");

    expect(toSource.getAttribute("title")).toBe("Show the raw skill fragment");
    fireEvent.click(toSource);

    expect(screen.getByLabelText("Skill fragment")).toBeTruthy();
  });

  it("keeps the preview reachable while the fragments list is loading", () => {
    renderScreen({ kind: "loading" });

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
      renderSlots([slot({ builtIn: "COPY-ME", override: "MINE" })]);

      fireEvent.click(screen.getByText("Show default"));
      fireEvent.click(screen.getByText("Copy"));

      expect(writeText).toHaveBeenCalledWith("COPY-ME");
    });
  });
});
