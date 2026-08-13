// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaveGuardContext } from "#webui/components/context/collection/leave-guard";
import { markdownEditorTestMock } from "#webui/components/context/tests/markdown-editor-test-mock";
import {
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";
import { CustomSkillEditor } from "#webui/components/context/skills/CustomSkillEditor";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/context/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

const ENTRY: CustomSkillView = {
  name: "jazz-voicings",
  description: "rich chord voicings",
  enabled: true,
  body: "Voice with 3rds and 7ths.",
};

/**
 * Minimal collection stub tracking only the delete call.
 * @param deleteEntry - The deleteEntry spy to expose
 * @returns A collection hook stub
 */
function stubCollection(
  deleteEntry: UseCustomSkillsCollectionReturn["deleteEntry"],
): UseCustomSkillsCollectionReturn {
  return {
    status: { kind: "ready", entries: [ENTRY] },
    saveStatus: "idle",
    saveError: null,
    saveEntry: vi.fn(),
    renameEntry: vi.fn(),
    deleteEntry,
    resetSaveStatus: vi.fn(),
    refresh: vi.fn(),
  };
}

interface EditorProps {
  collection: UseCustomSkillsCollectionReturn;
  entry: CustomSkillView | null;
  onSaved?: (name: string) => void;
  onDeleted?: () => void;
}

/**
 * Builds the editor element with no-op callbacks by default, so a rerender can
 * swap the entry prop without restating the full prop list.
 * @param props - Editor props
 * @param props.collection - The custom skills collection hook stub
 * @param props.entry - The skill being edited, or null when creating
 * @param props.onSaved - Save callback; defaults to a fresh spy
 * @param props.onDeleted - Delete callback; defaults to a fresh spy
 * @returns The CustomSkillEditor element
 */
function editorElement({
  collection,
  entry,
  onSaved = vi.fn(),
  onDeleted = vi.fn(),
}: EditorProps): preact.JSX.Element {
  return (
    <CustomSkillEditor
      collection={collection}
      entry={entry}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}

/**
 * Renders the editor with no-op callbacks by default.
 * @param props - Editor props; onSaved/onDeleted default to fresh spies
 * @returns The testing-library render result
 */
function renderEditor(props: EditorProps): ReturnType<typeof render> {
  return render(editorElement(props));
}

/**
 * Renders the editor for the saved ENTRY with window.confirm stubbed to answer
 * the delete prompt, exposing the spies the delete flow is asserted against.
 * @param confirmed - What the confirm dialog returns when Delete is clicked
 * @returns The deleteEntry and onDeleted spies passed to the editor
 */
function renderForDeleteConfirm(confirmed: boolean): {
  deleteEntry: ReturnType<typeof vi.fn>;
  onDeleted: ReturnType<typeof vi.fn>;
} {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(confirmed));
  const deleteEntry = vi.fn().mockResolvedValue(true);
  const onDeleted = vi.fn();

  renderEditor({
    collection: stubCollection(deleteEntry),
    entry: ENTRY,
    onDeleted,
  });

  return { deleteEntry, onDeleted };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomSkillEditor — new draft is not auto-saved on close", () => {
  /**
   * Fill the create form with a complete new-skill draft.
   */
  function fillCreateForm(): void {
    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "jazz-voicings" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Instructions/ }), {
      target: { value: "Voice with 3rds." },
    });
  }

  it("never persists a new draft on unmount — Create is the only create path", () => {
    // Even a complete draft is created ONLY by the explicit Create button; a
    // navigate-away confirms a discard instead of silently saving, matching the
    // memory editor.
    const collection = stubCollection(vi.fn());

    collection.saveEntry = vi.fn();

    const { unmount } = renderEditor({ collection, entry: null });

    fillCreateForm();

    // Close the overlay (Escape / backdrop / ×) WITHOUT clicking Create.
    unmount();

    expect(collection.saveEntry).not.toHaveBeenCalled();
  });

  it("registers a discard confirm while a dirty new draft is open", () => {
    const collection = stubCollection(vi.fn());
    let registered: (() => boolean) | null = null;
    const guard = {
      register: (next: (() => boolean) | null) => {
        registered = next;
      },
      confirmLeave: () => registered == null || registered(),
    };

    render(
      <LeaveGuardContext.Provider value={guard}>
        {editorElement({ collection, entry: null })}
      </LeaveGuardContext.Provider>,
    );

    // Blank form: nothing to lose, so navigating away is silent.
    expect(guard.confirmLeave()).toBe(true);

    fillCreateForm();

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    expect(guard.confirmLeave()).toBe(false);
    expect(window.confirm).toHaveBeenCalledOnce();
  });
});

describe("CustomSkillEditor save", () => {
  it("notifies onSaved with the saved name when Save succeeds", async () => {
    const collection = stubCollection(vi.fn());

    collection.saveEntry = vi.fn().mockResolvedValue(ENTRY);
    const onSaved = vi.fn();

    renderEditor({ collection, entry: ENTRY, onSaved });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(ENTRY.name));
  });
});

describe("CustomSkillEditor delete confirmation", () => {
  it("deletes the entry and notifies onDeleted when confirmed", async () => {
    const { deleteEntry, onDeleted } = renderForDeleteConfirm(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(deleteEntry).toHaveBeenCalledWith(ENTRY.name);
  });

  it("aborts the delete when the confirm dialog is dismissed", async () => {
    const { deleteEntry, onDeleted } = renderForDeleteConfirm(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("CustomSkillEditor external update banner", () => {
  const BANNER_TEXT =
    "This skill was changed elsewhere (another tab or a hand edit).";

  it("appears when the entry prop changes externally while the draft is clean, and Reload re-seeds it", () => {
    const collection = stubCollection(vi.fn());
    const { rerender } = renderEditor({ collection, entry: ENTRY });

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();

    rerender(
      editorElement({
        collection,
        entry: { ...ENTRY, enabled: false, body: "Voice with 9ths now." },
      }),
    );

    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Instructions/ }),
    ).toHaveProperty("value", "Voice with 9ths now.");
    expect(screen.getByRole("checkbox", { name: /Enabled/ })).toHaveProperty(
      "checked",
      false,
    );
  });

  it("stays suppressed while the user is typing (dirty draft)", () => {
    const collection = stubCollection(vi.fn());
    const { rerender } = renderEditor({ collection, entry: ENTRY });

    fireEvent.input(screen.getByRole("textbox", { name: /Instructions/ }), {
      target: { value: "Still editing this myself." },
    });

    rerender(
      editorElement({
        collection,
        entry: { ...ENTRY, body: "Voice with 9ths now." },
      }),
    );

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });
});
