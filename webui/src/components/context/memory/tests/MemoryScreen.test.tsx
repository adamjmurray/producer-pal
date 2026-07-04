// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type MemoryCollectionStatus,
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryScreen } from "#webui/components/context/memory/MemoryScreen";

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

const ENTRIES: MemoryEntryView[] = [
  {
    name: "prefers-c-minor",
    type: "user",
    description: "default key & genre",
    body: "Composes in C minor.",
  },
  { name: "no-desc", type: "user", description: "", body: "x" },
  {
    name: "loose-drums",
    type: "feedback",
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
  return {
    status,
    saveStatus: "idle",
    saveError: null,
    saveEntry: vi.fn().mockResolvedValue(null),
    deleteEntry: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
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

  render(
    <MemoryScreen
      collection={collection}
      tabSlot={TAB_SLOT}
      onClose={onClose}
    />,
  );

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

  it("groups entries by type, omitting empty groups", () => {
    renderScreen({ kind: "ready", entries: ENTRIES });

    // Groups that have entries render their heading…
    expect(screen.getByText("User")).toBeTruthy();
    expect(screen.getByText("Feedback")).toBeTruthy();
    // …empty groups do not (Project/Reference have no entries here).
    expect(screen.queryByText("Project")).toBeNull();
    expect(screen.queryByText("Reference")).toBeNull();
    // Descriptions render as the recall hooks.
    expect(screen.getByText("default key & genre")).toBeTruthy();
    expect(screen.getByText("swing/humanize")).toBeTruthy();
  });

  it("selects an entry to edit, then returns to the create form", () => {
    renderScreen({ kind: "ready", entries: ENTRIES });

    // Defaults to the create form.
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /prefers-c-minor/ }));

    // The editor switches to the existing entry (Save + Delete, no create).
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create memory" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+ New memory" }));

    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("saves edits to the selected entry through the collection hook", async () => {
    const first = ENTRIES[0] as MemoryEntryView;
    const saveEntry = vi.fn().mockResolvedValue(first);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { saveEntry },
    );

    renderWith(collection);

    fireEvent.click(screen.getByRole("button", { name: /prefers-c-minor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveEntry).toHaveBeenCalledWith("prefers-c-minor", {
        type: "user",
        description: "default key & genre",
        content: "Composes in C minor.",
      });
    });
  });

  it("returns to the create form after deleting the selected entry", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteEntry = vi.fn().mockResolvedValue(true);
    const collection = fakeCollection(
      { kind: "ready", entries: ENTRIES },
      { deleteEntry },
    );

    renderWith(collection);

    fireEvent.click(screen.getByRole("button", { name: /prefers-c-minor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith("prefers-c-minor");
    });
    // onDeleted returns the right pane to the create form.
    expect(screen.getByRole("button", { name: "Create memory" })).toBeTruthy();
  });
});
