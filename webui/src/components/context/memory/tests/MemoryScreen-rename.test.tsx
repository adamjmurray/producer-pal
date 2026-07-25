// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { markdownEditorTestMock } from "#webui/components/context/tests/markdown-editor-test-mock";
import {
  type Deferred,
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import {
  type MemoryEntryView,
  useMemoryCollection,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryScreen } from "#webui/components/context/memory/MemoryScreen";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/context/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

const ENTRY: MemoryEntryView = {
  name: "prefers-c-minor",
  description: "default key & genre",
  body: "Composes in C minor.",
};

/** The server's echo of the rename: the same fields under the new slug. */
const RENAMED: MemoryEntryView = { ...ENTRY, name: "new-slug" };

const fetchMock = installFetchMock();

/** One captured entry PUT (the autosave/create channel, not the rename one). */
interface CapturedSave {
  url: string;
  body: { description: string; content: string };
}

/**
 * The Memory tab wired to the REAL collection hook over the stubbed fetch, so a
 * rename runs its true round trip: the list commit lands in one microtask and
 * the caller's navigation in the next. The screen-level fakes elsewhere can't
 * express that ordering, which is exactly where the dropped-draft bug lived.
 * @returns The screen element
 */
function MemoryScreenHarness(): preact.JSX.Element {
  const collection = useMemoryCollection();

  return <MemoryScreen collection={collection} tabSlot={TAB_SLOT} />;
}

/**
 * Queue the stubbed fetch for one rename round trip: the mount GET lists
 * `ENTRY`, the rename PUT hangs on a deferred the test resolves, and anything
 * after that echoes the renamed entry.
 * @returns The rename PUT's deferred response
 */
function routeFetch(): Deferred<Response> {
  const renamePut = deferred<Response>();

  fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [ENTRY] }));
  fetchMock.mockReturnValueOnce(renamePut.promise);
  fetchMock.mockResolvedValue(jsonResponse({ entry: RENAMED }));

  return renamePut;
}

/**
 * The entry PUTs the editor issued — the save channel, excluding the rename.
 * @returns One record per captured write, in dispatch order
 */
function entryPuts(): CapturedSave[] {
  const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];

  return calls
    .filter(([url, init]) => init?.method === "PUT" && !url.endsWith("/rename"))
    .map(([url, init]) => ({
      url,
      body: JSON.parse(String(init?.body)) as CapturedSave["body"],
    }));
}

/**
 * Open `ENTRY` in the right pane and commit a rename to "New Slug" (which the
 * server slugifies to `RENAMED`) whose PUT is left in flight.
 */
async function startRename(): Promise<void> {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit prefers-c-minor" }),
  );

  const nameInput = screen.getByRole("textbox", { name: "Rename" });

  fireEvent.input(nameInput, { target: { value: "New Slug" } });
  fireEvent.blur(nameInput);

  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rename")),
    ).toBe(true);
  });
}

/**
 * The current value of a textbox in the open editor.
 * @param name - The field's accessible name
 * @returns The input's value
 */
function fieldValue(name: string | RegExp): string {
  return (screen.getByRole("textbox", { name }) as HTMLInputElement).value;
}

/**
 * Wait out the editor's idle autosave: preact defers post-paint effects (the
 * arming) to a real timeout that happy-dom's rAF never beats, then the debounce
 * itself runs. Both directions need the same settle, so whether a save fires is
 * an honest assertion either way.
 */
async function settleAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

describe("MemoryScreen — editing during an in-flight rename", () => {
  it("keeps the draft typed while the rename was in flight and saves it under the new slug", async () => {
    const renamePut = routeFetch();

    render(<MemoryScreenHarness />);

    await startRename();

    // The rename round trip is open — keep typing into the body and the
    // description (the latter is a controlled input, so a remount that re-seeds
    // from the server's pre-edit echo is visible in the DOM).
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Composes in C minor and F minor." },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "edited mid-rename" },
    });

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    // The list (and the editor) follow the entry to its slugified new name…
    await screen.findByRole("button", { name: "Edit new-slug" });
    expect(fieldValue("Rename")).toBe("new-slug");
    // …carrying the in-flight edits rather than snapping back to the echo.
    expect(fieldValue(/Description/)).toBe("edited mid-rename");

    // And the carried draft is really persisted — the autosave commits it under
    // the NEW slug, since the rename's echo left the draft legitimately dirty.
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([
      {
        url: expect.stringContaining("new-slug") as string,
        body: {
          description: "edited mid-rename",
          content: "Composes in C minor and F minor.",
        },
      },
    ]);
  });

  it("does not re-save an untouched entry after a rename", async () => {
    const renamePut = routeFetch();

    render(<MemoryScreenHarness />);

    await startRename();

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await screen.findByRole("button", { name: "Edit new-slug" });

    // The rename's own echo is the new baseline, so an untouched draft is clean:
    // following the entry to its new slug must not trigger a redundant write.
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([]);
  });
});
