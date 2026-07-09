// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDocCollection } from "#webui/hooks/context/tests/doc-collection-test-helpers";
import {
  type MemoryEntryInput,
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryEntryEditor } from "#webui/components/context/memory/MemoryEntryEditor";

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

describe("MemoryEntryEditor — new entry", () => {
  it("disables Create until a name and body are present, then saves", async () => {
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
        onDeleted={vi.fn()}
      />,
    );

    const create = screen.getByRole("button", {
      name: "Create memory",
    }) as HTMLButtonElement;

    expect(create.disabled).toBe(true);

    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "loose-drums" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "swing" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Apply groove." },
    });

    expect(create.disabled).toBe(false);

    fireEvent.click(create);

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

  it("does not fire onSaved when the save fails", async () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(null),
    });
    const onSaved = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={null}
        onSaved={onSaved}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "x" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "y" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    await waitFor(() => {
      expect(collection.saveEntry).toHaveBeenCalled();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("MemoryEntryEditor — autosave on close", () => {
  it("persists a new draft on unmount so closing before Create doesn't lose it", () => {
    const saved: MemoryEntryView = {
      name: "loose-drums",
      description: "",
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
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "loose-drums" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "groove" },
    });

    // Close the overlay (Escape / backdrop / ×) WITHOUT clicking Create.
    unmount();

    expect(collection.saveEntry).toHaveBeenCalledWith(
      "loose-drums",
      { description: "", content: "groove" },
      true,
    );
  });
});

describe("MemoryEntryEditor — existing entry", () => {
  it("shows the slug read-only and saves edits under the same name", async () => {
    const collection = fakeCollection({
      saveEntry: vi.fn().mockResolvedValue(EXISTING),
    });
    const onSaved = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={onSaved}
        onDeleted={vi.fn()}
      />,
    );

    // The name is not an editable field for an existing entry.
    expect(screen.queryByRole("textbox", { name: /Name/ })).toBeNull();
    expect(screen.getByText("prefers-c-minor")).toBeTruthy();

    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Composes in C minor and F minor." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith("prefers-c-minor");
    });
    // Editing an existing entry targets a known slug, so overwrite is intended.
    expect(collection.saveEntry).toHaveBeenCalledWith(
      "prefers-c-minor",
      {
        description: "default key & genre",
        content: "Composes in C minor and F minor.",
      },
      false,
    );
  });

  it("deletes after confirmation and calls onDeleted", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const collection = fakeCollection({
      deleteEntry: vi.fn().mockResolvedValue(true),
    });
    const onDeleted = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledOnce();
    });
    expect(collection.deleteEntry).toHaveBeenCalledWith("prefers-c-minor");
  });

  it("does not delete when the user cancels the confirm", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const collection = fakeCollection();
    const onDeleted = vi.fn();

    render(
      <MemoryEntryEditor
        collection={collection}
        entry={EXISTING}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(collection.deleteEntry).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("MemoryEntryEditor — save status", () => {
  it.each([
    ["saving", "Saving…"],
    ["saved", "Saved"],
  ] as const)("shows %s status text", (saveStatus, text) => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection({ saveStatus })}
        entry={EXISTING}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText(text)).toBeTruthy();
  });

  it("shows the save error message", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection({
          saveStatus: "error",
          saveError: "Memory body must not be empty",
        })}
        entry={EXISTING}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText("Memory body must not be empty")).toBeTruthy();
  });

  it("falls back to 'Save failed' when there is no error message", () => {
    render(
      <MemoryEntryEditor
        collection={fakeCollection({ saveStatus: "error", saveError: null })}
        entry={EXISTING}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText("Save failed")).toBeTruthy();
  });
});
