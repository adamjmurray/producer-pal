// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";
import { CustomSkillEditor } from "#webui/components/context/skills/CustomSkillEditor";

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
    deleteEntry,
    refresh: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomSkillEditor autosave on close", () => {
  it("persists a new draft on unmount so closing before Create doesn't lose it", () => {
    const saveEntry = vi.fn().mockResolvedValue({
      name: "jazz-voicings",
      description: "",
      enabled: true,
      body: "Voice with 3rds.",
    });
    const collection: UseCustomSkillsCollectionReturn = {
      status: { kind: "ready", entries: [] },
      saveStatus: "idle",
      saveError: null,
      saveEntry,
      deleteEntry: vi.fn(),
      refresh: vi.fn(),
    };

    const { unmount } = render(
      <CustomSkillEditor
        collection={collection}
        entry={null}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByRole("textbox", { name: /Name/ }), {
      target: { value: "jazz-voicings" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Instructions/ }), {
      target: { value: "Voice with 3rds." },
    });

    // Close the overlay (Escape / backdrop / ×) WITHOUT clicking Create.
    unmount();

    expect(saveEntry).toHaveBeenCalledWith(
      "jazz-voicings",
      { description: "", content: "Voice with 3rds.", enabled: true },
      true,
    );
  });
});

describe("CustomSkillEditor delete confirmation", () => {
  it("aborts the delete when the confirm dialog is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const deleteEntry = vi.fn().mockResolvedValue(true);
    const onDeleted = vi.fn();

    render(
      <CustomSkillEditor
        collection={stubCollection(deleteEntry)}
        entry={ENTRY}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
