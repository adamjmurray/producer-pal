// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markdownEditorTestMock } from "#webui/components/markdown-editor/tests/markdown-editor-test-mock";
import { fakeDocCollection } from "#webui/hooks/context/tests/doc-collection-test-helpers";
import {
  type CustomSkillInput,
  type CustomSkillsStatus,
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";
import { CustomSkillsScreen } from "#webui/components/context/skills/CustomSkillsScreen";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/markdown-editor/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

const ENTRIES: CustomSkillView[] = [
  {
    name: "jazz-voicings",
    description: "rich chord voicings",
    enabled: true,
    body: "Voice with 3rds and 7ths.",
  },
  {
    name: "wip-idea",
    description: "half-baked",
    enabled: false,
    body: "Draft.",
  },
];

/**
 * Build a fake collection hook return in the given status.
 * @param status - The collection status to expose
 * @param over - Fields to override on the default (idle, no-op) hook return
 * @returns A UseCustomSkillsCollectionReturn stub
 */
function fakeCollection(
  status: CustomSkillsStatus,
  over: Partial<UseCustomSkillsCollectionReturn> = {},
): UseCustomSkillsCollectionReturn {
  return fakeDocCollection<CustomSkillView, CustomSkillInput>(status, over);
}

/**
 * Render CustomSkillsScreen with the given collection.
 * @param collection - The collection hook return to pass
 */
function renderWith(collection: UseCustomSkillsCollectionReturn): void {
  render(
    <CustomSkillsScreen
      collection={collection}
      tabSlot={TAB_SLOT}
      onClose={vi.fn()}
    />,
  );
}

/**
 * Render the ready screen with a save spy and open `wip-idea` (the disabled
 * entry) for editing.
 * @returns The saveEntry spy the screen will call
 */
function openWipIdeaForEdit(): ReturnType<typeof vi.fn> {
  const saveEntry = vi.fn().mockResolvedValue(ENTRIES[1]);

  renderWith(
    fakeCollection({ kind: "ready", entries: ENTRIES }, { saveEntry }),
  );

  fireEvent.click(screen.getByRole("button", { name: /wip-idea/ }));

  return saveEntry;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomSkillsScreen", () => {
  it("shows a loading message while the collection loads", () => {
    renderWith(fakeCollection({ kind: "loading" }));

    expect(screen.getByText("Loading custom skills…")).toBeTruthy();
  });

  it("lists skills flat, dimming and tagging the disabled ones", () => {
    renderWith(fakeCollection({ kind: "ready", entries: ENTRIES }));

    expect(screen.getByText("jazz-voicings")).toBeTruthy();
    expect(screen.getByText("rich chord voicings")).toBeTruthy();
    expect(screen.getByText("wip-idea")).toBeTruthy();
    // The disabled skill carries an "off" tag.
    expect(screen.getByText("off")).toBeTruthy();
  });

  it("shows an empty-list note and the create form when there are none", () => {
    renderWith(fakeCollection({ kind: "ready", entries: [] }));

    expect(screen.getByText("No custom skills yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeTruthy();
  });

  it("selects a skill, reflecting its enabled flag in the toggle", () => {
    renderWith(fakeCollection({ kind: "ready", entries: ENTRIES }));

    fireEvent.click(screen.getByRole("button", { name: /wip-idea/ }));

    // The disabled skill opens with its enable toggle unchecked.
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New skill" }));

    expect(screen.getByRole("button", { name: "Create skill" })).toBeTruthy();
  });

  it("saves typed edits, preserving the entry's enabled flag in the payload", async () => {
    const saveEntry = openWipIdeaForEdit();

    fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "now solid" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Instructions/ }), {
      target: { value: "Do the thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveEntry).toHaveBeenCalledWith(
        "wip-idea",
        { description: "now solid", content: "Do the thing.", enabled: false },
        false,
      );
    });
  });

  it("toggles enabled on and sends it in the saved payload", async () => {
    const saveEntry = openWipIdeaForEdit();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveEntry).toHaveBeenCalledWith(
        "wip-idea",
        expect.objectContaining({ enabled: true }),
        false,
      );
    });
  });

  it("deletes the selected skill through the collection hook", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteEntry = vi.fn().mockResolvedValue(true);

    renderWith(
      fakeCollection({ kind: "ready", entries: ENTRIES }, { deleteEntry }),
    );

    fireEvent.click(screen.getByRole("button", { name: /jazz-voicings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith("jazz-voicings");
    });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeTruthy();
  });
});
