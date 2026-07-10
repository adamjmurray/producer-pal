// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { type VNode } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markdownEditorTestMock } from "#webui/components/context/tests/markdown-editor-test-mock";
import {
  type LeaveGuard,
  LeaveGuardContext,
} from "#webui/components/context/collection/leave-guard";
import { fakeDocCollection } from "#webui/hooks/context/tests/doc-collection-test-helpers";
import {
  type MemoryCollectionStatus,
  type MemoryEntryInput,
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryScreen } from "#webui/components/context/memory/MemoryScreen";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/context/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

const ENTRIES: MemoryEntryView[] = [
  {
    name: "prefers-c-minor",
    description: "default key & genre",
    body: "Composes in C minor.",
  },
  { name: "no-desc", description: "", body: "x" },
  {
    name: "loose-drums",
    description: "swing/humanize",
    body: "Apply groove.",
  },
];

/**
 * Build a fake collection hook return in the given status.
 * @param status - The collection status to expose
 * @param over - Fields to override on the default (idle, no-op) hook return
 * @returns A UseMemoryCollectionReturn stub
 */
function fakeCollection(
  status: MemoryCollectionStatus,
  over: Partial<UseMemoryCollectionReturn> = {},
): UseMemoryCollectionReturn {
  return fakeDocCollection<MemoryEntryView, MemoryEntryInput>(status, over);
}

/**
 * Build a MemoryScreen element for the given collection.
 * @param collection - The collection hook return to pass
 * @param onClose - Close spy (defaults to a fresh no-op)
 * @returns The MemoryScreen element
 */
function screenEl(
  collection: UseMemoryCollectionReturn,
  onClose: () => void = vi.fn(),
): VNode {
  return (
    <MemoryScreen
      collection={collection}
      tabSlot={TAB_SLOT}
      onClose={onClose}
    />
  );
}

/**
 * Render MemoryScreen with the given collection.
 * @param collection - The collection hook return to pass
 * @returns The onClose spy for close-button assertions
 */
function renderWith(collection: UseMemoryCollectionReturn): {
  onClose: () => void;
} {
  const onClose = vi.fn();

  render(screenEl(collection, onClose));

  return { onClose };
}

/**
 * Render MemoryScreen with a default (no-op) collection in the given status.
 * @param status - The collection status
 * @returns The onClose spy for close-button assertions
 */
function renderScreen(status: MemoryCollectionStatus): { onClose: () => void } {
  return renderWith(fakeCollection(status));
}

/**
 * A real ref-backed leave guard (matching {@link useLeaveGuard}), so the editor
 * that registers a discard-confirm and the list that calls confirmLeave share
 * one registry — the same wiring ContextTabs provides in the app.
 * @returns A leave guard for a test provider
 */
function makeGuard(): LeaveGuard {
  let registered: (() => boolean) | null = null;

  return {
    register: (guard) => {
      registered = guard;
    },
    confirmLeave: () => registered == null || registered(),
  };
}

/**
 * Render MemoryScreen wrapped in a leave-guard provider (as ContextTabs does),
 * so the new-draft discard confirm is wired end to end.
 * @param collection - The collection hook return to pass
 */
function renderGuarded(collection: UseMemoryCollectionReturn): void {
  render(
    <LeaveGuardContext.Provider value={makeGuard()}>
      {screenEl(collection)}
    </LeaveGuardContext.Provider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemoryScreen — status states", () => {
  it("shows a loading message while the collection loads", () => {
    renderScreen({ kind: "loading" });

    expect(screen.getByText("Loading memory…")).toBeTruthy();
  });

  it("shows the error message when the collection errored", () => {
    renderScreen({ kind: "error", message: "Memory request failed (500)" });

    // The header indicator and the centered body both surface the message.
    expect(
      screen.getAllByText("Memory request failed (500)").length,
    ).toBeGreaterThan(0);
  });

  it("wires the close button to onClose", () => {
    const { onClose } = renderScreen({ kind: "ready", entries: [] });

    fireEvent.click(screen.getByLabelText("Close context editor"));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("MemoryScreen — ready", () => {
  it("shows an empty-list note and the create form when there are no memories", () => {
    renderScreen({ kind: "ready", entries: [] });

    expect(screen.getByText("No memories yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });

  it("renders a flat, name-sorted list of entries", () => {
    renderScreen({ kind: "ready", entries: ENTRIES });

    // Descriptions render as the recall hooks.
    expect(screen.getByText("default key & genre")).toBeTruthy();
    expect(screen.getByText("swing/humanize")).toBeTruthy();

    const names = screen
      .getAllByText(/^(loose-drums|no-desc|prefers-c-minor)$/)
      .map((el) => el.textContent);

    expect(names).toStrictEqual(["loose-drums", "no-desc", "prefers-c-minor"]);
  });

  it("selects an entry to edit (autosave, no Save button), then returns to the create form", () => {
    renderScreen({ kind: "ready", entries: ENTRIES });

    // Defaults to the create form.
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    // The editor switches to the existing entry — an editable Rename field,
    // no Save button (it autosaves), and no create button.
    expect(screen.getByRole("textbox", { name: "Rename" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create memory" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New memory" }));

    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Rename" })).toBeNull();
  });

  it("autosaves edits to the selected entry when navigating away", async () => {
    const first = ENTRIES[0] as MemoryEntryView;
    const saveEntry = vi.fn().mockResolvedValue(first);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { saveEntry },
    );

    renderWith(collection);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Composes in C minor and F minor." },
    });
    // Switching away unmounts the editor, flushing the autosave under the slug.
    fireEvent.click(screen.getByRole("button", { name: "New memory" }));

    await waitFor(() => {
      expect(saveEntry).toHaveBeenCalledWith(
        "prefers-c-minor",
        {
          description: "default key & genre",
          content: "Composes in C minor and F minor.",
        },
        false,
      );
    });
  });

  it("shows the save status in the header while editing, but not on the create form", () => {
    // A "saved" collection status: the header indicator shows it when an entry
    // is open, and must NOT leak onto the create form (the reported bug).
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { saveStatus: "saved" },
    );

    renderWith(collection);

    // Create form (default): no "Saved" indicator in the header.
    expect(screen.queryByText("Saved")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    // Editing an entry: the header surfaces the save status.
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("resets the save status when the edited entry changes", () => {
    const resetSaveStatus = vi.fn();
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { resetSaveStatus },
    );

    renderWith(collection);
    resetSaveStatus.mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    expect(resetSaveStatus).toHaveBeenCalled();
  });

  it("returns to the create form after deleting the selected entry via its row", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteEntry = vi.fn().mockResolvedValue(true);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { deleteEntry },
    );

    renderWith(collection);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );
    // Delete lives on the list row (hover trash), not the editor footer.
    fireEvent.click(
      screen.getByRole("button", { name: "Delete prefers-c-minor" }),
    );

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith("prefers-c-minor");
    });
    // Deleting the open entry returns the right pane to the create form.
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });

  it("does not delete when the row-trash confirm is cancelled", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const deleteEntry = vi.fn().mockResolvedValue(true);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { deleteEntry },
    );

    renderWith(collection);

    fireEvent.click(
      screen.getByRole("button", { name: "Delete prefers-c-minor" }),
    );

    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("deletes a non-open row without disturbing the create form", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteEntry = vi.fn().mockResolvedValue(true);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { deleteEntry },
    );

    renderWith(collection);

    // No entry is open (create form). Deleting a row leaves the form as-is.
    fireEvent.click(
      screen.getByRole("button", { name: "Delete prefers-c-minor" }),
    );

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith("prefers-c-minor");
    });
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });
});

describe("MemoryScreen — deleted externally", () => {
  it("keeps the draft and shows a banner when a poll deletes the edited entry", () => {
    const { rerender } = render(
      screenEl(fakeCollection({ kind: "ready", entries: ENTRIES })),
    );

    // Select an entry and start editing its body.
    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "in-progress edit" },
    });

    // A poll (assistant forget / hand delete) drops it from the collection.
    rerender(
      screenEl(fakeCollection({ kind: "ready", entries: ENTRIES.slice(1) })),
    );

    // The banner explains the state; the draft survives (not reset to blank).
    expect(screen.getByText(/deleted outside the editor/i)).toBeTruthy();
    expect(
      (screen.getByRole("textbox", { name: /Memory/ }) as HTMLTextAreaElement)
        .value,
    ).toBe("in-progress edit");
  });

  it("discards the draft and returns to the create form", () => {
    const { rerender } = render(
      screenEl(fakeCollection({ kind: "ready", entries: ENTRIES })),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );
    rerender(
      screenEl(fakeCollection({ kind: "ready", entries: ENTRIES.slice(1) })),
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByText(/deleted outside the editor/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });

  it("does NOT re-create the deleted entry when a dirty draft is discarded", () => {
    // Regression: Discard changes the editor key, and the unmounting editor's
    // autosave flush used to persist the dirty draft — silently re-creating
    // the entry the user just chose to drop.
    const saveEntry = vi.fn().mockResolvedValue(null);
    const { rerender } = render(
      screenEl(
        fakeCollection({ kind: "ready", entries: ENTRIES }, { saveEntry }),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );
    rerender(
      screenEl(
        fakeCollection(
          { kind: "ready", entries: ENTRIES.slice(1) },
          { saveEntry },
        ),
      ),
    );

    // Edit AFTER the deletion (banner visible), then bail out via Discard.
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "in-progress edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(saveEntry).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });
});

describe("MemoryScreen — new-draft discard guard", () => {
  // Type a value into the (new) create form's Name field.
  const typeNewName = (value: string): void => {
    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value },
    });
  };

  it("confirms before leaving a filled new draft; cancelling keeps the form", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    renderGuarded(fakeCollection({ kind: "ready", entries: ENTRIES }));

    typeNewName("half-typed");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    // Cancelled → the create form (with its draft) stays put.
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Rename" })).toBeNull();
  });

  it("leaves the new draft when the discard is confirmed", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    renderGuarded(fakeCollection({ kind: "ready", entries: ENTRIES }));

    typeNewName("half-typed");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    // Confirmed → navigation proceeds to the existing entry (Rename field).
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Rename" })).toBeTruthy();
  });

  it("does not confirm when the new draft is still blank", () => {
    vi.stubGlobal("confirm", vi.fn());
    renderGuarded(fakeCollection({ kind: "ready", entries: ENTRIES }));

    // No fields typed — nothing to discard, so navigation is silent.
    fireEvent.click(
      screen.getByRole("button", { name: "Edit prefers-c-minor" }),
    );

    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Rename" })).toBeTruthy();
  });
});
