// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markdownEditorTestMock } from "#webui/components/context/tests/markdown-editor-test-mock";
import { fakeDocCollection } from "#webui/hooks/context/tests/doc-collection-test-helpers";
import {
  type MemoryEntryInput,
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryEntryEditor } from "#webui/components/context/memory/MemoryEntryEditor";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/context/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

/**
 * Build a fake collection hook return with overridable fields.
 * @param over - Fields to override on the default (idle, no-op) hook return
 * @returns A UseMemoryCollectionReturn stub
 */
function fakeCollection(
  over: Partial<UseMemoryCollectionReturn> = {},
): UseMemoryCollectionReturn {
  return fakeDocCollection<MemoryEntryView, MemoryEntryInput>(
    { kind: "ready", entries: [] },
    over,
  );
}

const EXISTING: MemoryEntryView = {
  name: "prefers-c-minor",
  description: "default key & genre",
  body: "Composes in C minor.",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Fill the create form's three required fields.
 * @param values - The name, description, and body to type
 * @param values.name - The name to type
 * @param values.description - The description to type
 * @param values.body - The body to type
 */
function fillCreateForm(values: {
  name: string;
  description: string;
  body: string;
}): void {
  fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
    target: { value: values.name },
  });
  fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
    target: { value: values.description },
  });
  fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
    target: { value: values.body },
  });
}

describe("MemoryEntryEditor — new entry", () => {
  it("reveals every field error and blocks Create until name, description, and body are filled", async () => {
    const saved: MemoryEntryView = {
      name: "loose-drums",
      description: "swing",
      body: "Apply groove.",
    };
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(saved),
    });
    const onSaved = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={null}
        onSaved={onSaved}
      />,
    );

    // Clicking Create on a blank form reveals each required-field error and
    // does not save (rather than a silently-disabled button with no reason).
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(screen.getByText("Name is required.")).toBeTruthy();
    expect(screen.getByText("Description is required.")).toBeTruthy();
    expect(screen.getByText("Memory contents are required.")).toBeTruthy();
    expect(collection.saveEntry).not.toHaveBeenCalled();

    fillCreateForm({
      name: "loose-drums",
      description: "swing",
      body: "Apply groove.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith("loose-drums");
    });
    // Create flow is create-only so a colliding name can't silently overwrite.
    expect(collection.saveEntry).toHaveBeenCalledWith(
      "loose-drums",
      {
        description: "swing",
        content: "Apply groove.",
      },
      true,
    );
  });

  it("shows the description error on blur without touching the others", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection()}
        entry={null}
        onSaved={vi.fn()}
      />,
    );

    // Leaving the (empty) description flags only it; name/body stay quiet.
    fireEvent.blur(screen.getByRole("textbox", { name: /Description/ }));

    expect(screen.getByText("Description is required.")).toBeTruthy();
    expect(screen.queryByText("Name is required.")).toBeNull();
    expect(screen.queryByText("Memory contents are required.")).toBeNull();
  });

  it("flags the name and contents fields on blur too", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection()}
        entry={null}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.blur(screen.getByRole("textbox", { name: /Name/ }));
    fireEvent.blur(screen.getByRole("textbox", { name: /Memory/ }));

    expect(screen.getByText("Name is required.")).toBeTruthy();
    expect(screen.getByText("Memory contents are required.")).toBeTruthy();
  });

  it("does not fire onSaved when a valid save fails", async () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(null),
    });
    const onSaved = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={null}
        onSaved={onSaved}
      />,
    );

    fillCreateForm({ name: "x", description: "d", body: "y" });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    await waitFor(() => {
      expect(collection.saveEntry).toHaveBeenCalled();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("MemoryEntryEditor — new draft is not auto-saved on close", () => {
  it("never persists a new draft on unmount — Create is the only create path", () => {
    // Even a complete draft is created ONLY by the explicit Create button; a
    // navigate-away confirms a discard (see MemoryScreen.test) instead of
    // silently saving.
    const saved: MemoryEntryView = {
      name: "loose-drums",
      description: "swing",
      body: "groove",
    };
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(saved),
    });

    const { unmount } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={null}
        onSaved={vi.fn()}
      />,
    );

    fillCreateForm({
      name: "loose-drums",
      description: "swing",
      body: "groove",
    });

    // Close the overlay (Escape / backdrop / ×) WITHOUT clicking Create.
    unmount();

    expect(collection.saveEntry).not.toHaveBeenCalled();
  });
});

describe("MemoryEntryEditor — existing entry", () => {
  it("seeds the editable name and autosaves body edits on close under the same slug", () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(EXISTING),
    });

    const { unmount } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    // The name is an editable Rename field seeded with the current slug.
    expect(
      (screen.getByRole("textbox", { name: "Rename" }) as HTMLInputElement)
        .value,
    ).toBe("prefers-c-minor");

    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Composes in C minor and F minor." },
    });

    // Existing memories autosave — closing/navigating away flushes the edit
    // under the same slug (no Save button; the status shows in the header).
    unmount();

    expect(collection.saveEntry).toHaveBeenCalledWith(
      "prefers-c-minor",
      {
        description: "default key & genre",
        content: "Composes in C minor and F minor.",
      },
      false,
    );
  });

  // Existing memories autosave; the editor has neither a Save button (autosave)
  // nor a Delete button (delete lives on the list row, see MemoryList.test).
  it("renders neither a Save nor a Delete button for an existing memory", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection()}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("flags a cleared required field and blocks its autosave (no silent loss)", () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(EXISTING),
    });

    const { unmount } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    // Clearing the required description surfaces its error (existing entries are
    // pre-touched, so it shows at once) and blocks the autosave.
    fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "" },
    });

    expect(screen.getByText("Description is required.")).toBeTruthy();

    unmount();

    expect(collection.saveEntry).not.toHaveBeenCalled();
  });

  it("flags cleared contents on an existing memory", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection()}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "" },
    });

    expect(screen.getByText("Memory contents are required.")).toBeTruthy();
  });

  it("flags a cleared name and blocks the save, like the other fields", () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(EXISTING),
    });

    const { unmount } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    // Emptying the name surfaces its error (existing entries are pre-touched),
    // and a later body edit can't autosave while the form is invalid.
    fireEvent.input(screen.getByRole("textbox", { name: "Rename" }), {
      target: { value: "" },
    });
    expect(screen.getByText("Name is required.")).toBeTruthy();

    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "edited while name is blank" },
    });
    unmount();

    expect(collection.saveEntry).not.toHaveBeenCalled();
  });
});

describe("MemoryEntryEditor — rename", () => {
  const RENAMED: MemoryEntryView = {
    name: "new-slug",
    description: "default key & genre",
    body: "Composes in C minor.",
  };

  it("renames on blur, carrying the current fields and navigating to the new slug", async () => {
    const renameEntry = vi.fn().mockResolvedValue(RENAMED);
    const collection = fakeCollection({ renameEntry });
    const onSaved = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={onSaved}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: "Rename" });

    fireEvent.input(nameInput, { target: { value: "New Slug" } });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith("new-slug");
    });
    expect(renameEntry).toHaveBeenCalledWith("prefers-c-minor", "New Slug", {
      description: "default key & genre",
      content: "Composes in C minor.",
    });
  });

  it("commits the rename on Enter", async () => {
    const renameEntry = vi.fn().mockResolvedValue(RENAMED);
    const collection = fakeCollection({ renameEntry });

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: "Rename" });

    nameInput.focus();
    fireEvent.input(nameInput, { target: { value: "New Slug" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    await waitFor(() => {
      expect(renameEntry).toHaveBeenCalledWith(
        "prefers-c-minor",
        "New Slug",
        expect.anything(),
      );
    });
  });

  it("does not rename when the name is unchanged", () => {
    const renameEntry = vi.fn();
    const collection = fakeCollection({ renameEntry });

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    // Blur without editing the name.
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename" }));

    expect(renameEntry).not.toHaveBeenCalled();
  });

  it("reverts on Escape, but keeps an emptied name (with its error) rather than reverting", () => {
    const renameEntry = vi.fn();
    const collection = fakeCollection({ renameEntry });

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", {
      name: "Rename",
    }) as HTMLInputElement;

    // Escape restores the current slug in the field.
    fireEvent.input(nameInput, { target: { value: "half-typed" } });
    fireEvent.keyDown(nameInput, { key: "Escape" });
    expect(nameInput.value).toBe("prefers-c-minor");

    // Clearing the name keeps the field empty (no silent revert), surfaces the
    // required error, and does not rename to nothing — consistent with the
    // description/body fields.
    fireEvent.input(nameInput, { target: { value: "   " } });
    fireEvent.blur(nameInput);

    expect(nameInput.value).toBe("   ");
    expect(screen.getByText("Name is required.")).toBeTruthy();
    expect(renameEntry).not.toHaveBeenCalled();
  });

  it("clears the name error as soon as a valid name is typed", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection()}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: "Rename" });

    fireEvent.input(nameInput, { target: { value: "" } });
    expect(screen.getByText("Name is required.")).toBeTruthy();

    fireEvent.input(nameInput, { target: { value: "new-name" } });
    expect(screen.queryByText("Name is required.")).toBeNull();
  });

  it("reverts the name field when the rename fails (collision)", async () => {
    const renameEntry = vi.fn().mockResolvedValue(null);
    const collection = fakeCollection({
      renameEntry,
      saveStatus: "error",
      saveError: 'A memory named "taken" already exists',
    });

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", {
      name: "Rename",
    }) as HTMLInputElement;

    fireEvent.input(nameInput, { target: { value: "taken" } });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(renameEntry).toHaveBeenCalled();
    });
    // The field snaps back to the original slug (the collision error itself
    // surfaces in the header's save indicator, not here).
    await waitFor(() => {
      expect(
        (screen.getByRole("textbox", { name: "Rename" }) as HTMLInputElement)
          .value,
      ).toBe("prefers-c-minor");
    });
  });
});

// For an existing memory the save status lives in the header (see
// MemoryScreen.test); only the create flow shows an inline error by the button.
describe("MemoryEntryEditor — create error", () => {
  it("shows the create error inline beside the Create button", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection({
          saveStatus: "error",
          saveError: 'A memory named "taken" already exists',
        })}
        entry={null}
        onSaved={vi.fn()}
      />,
    );

    expect(
      screen.getByText('A memory named "taken" already exists'),
    ).toBeTruthy();
  });

  it("falls back to 'Save failed' inline when there is no error message", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection({ saveStatus: "error", saveError: null })}
        entry={null}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText("Save failed")).toBeTruthy();
  });
});

describe("MemoryEntryEditor — external update banner", () => {
  const BANNER_TEXT =
    "This memory was changed elsewhere (the assistant or another tab).";

  it("appears when the entry prop changes externally while the draft is clean", () => {
    const collection = fakeCollection();
    const { rerender } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();

    // The assistant's own context tool (or another tab) wrote to this entry
    // while it's open — the same instance stays mounted (the collection just
    // polled), so only the entry prop changes.
    rerender(
      <MemoryEntryEditor
        collection={collection}
        entry={{ ...EXISTING, body: "Composes in D minor now." }}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });

  it("Reload re-seeds the fields from the entry prop and dismisses the banner", () => {
    const collection = fakeCollection();
    const updated: MemoryEntryView = {
      name: "prefers-c-minor",
      description: "updated by the assistant",
      body: "Composes in D minor now.",
    };
    const { rerender } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    rerender(
      <MemoryEntryEditor
        collection={collection}
        entry={updated}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveProperty(
      "value",
      "updated by the assistant",
    );
    expect(screen.getByRole("textbox", { name: /Memory/ })).toHaveProperty(
      "value",
      "Composes in D minor now.",
    );
  });

  it("stays suppressed while the user is typing (dirty draft), even if the entry changes externally", () => {
    const collection = fakeCollection();
    const { rerender } = render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Still editing this myself." },
    });

    rerender(
      <MemoryEntryEditor
        collection={collection}
        entry={{ ...EXISTING, body: "Composes in D minor now." }}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });
});
