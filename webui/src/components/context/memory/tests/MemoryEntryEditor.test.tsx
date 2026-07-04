// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type SaveStatus } from "#webui/hooks/context/use-doc-memory";
import {
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
  return {
    status: { kind: "ready", entries: [] },
    saveStatus: "idle" as SaveStatus,
    saveError: null,
    saveEntry: vi.fn().mockResolvedValue(null),
    deleteEntry: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const EXISTING: MemoryEntryView = {
  name: "prefers-c-minor",
  type: "user",
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
      type: "feedback",
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
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "feedback" },
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
    expect(collection.saveEntry).toHaveBeenCalledWith("loose-drums", {
      type: "feedback",
      description: "swing",
      content: "Apply groove.",
    });
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
    expect(collection.saveEntry).toHaveBeenCalledWith("prefers-c-minor", {
      type: "user",
      description: "default key & genre",
      content: "Composes in C minor and F minor.",
    });
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
