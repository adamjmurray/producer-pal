// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { markdownEditorTestMock } from "#webui/components/markdown-editor/tests/markdown-editor-test-mock";
import {
  commitRename,
  EDITED_BODY,
  ENTRY,
  entryPuts,
  echoOf,
  openEntry,
  renameInput,
  renderMemoryScreen,
  settleAutosave,
  startRename,
  typeBody,
  typedFetchMock,
  typeRenameField,
} from "./memory-rename-test-helpers";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/markdown-editor/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

vi.mock(import("#webui/lib/constants/autosave"), () => ({
  VOICE_AUTOSAVE_DEBOUNCE_MS: 1,
  CONTEXT_EDITOR_SAVE_DEBOUNCE_MS: 1,
  DOC_COLLECTION_AUTOSAVE_DEBOUNCE_MS: 1,
}));

// Shrink the write deadline so the hung rename below gives up quickly — but
// keep it well past settleAutosave(), so the "held off" assertion is made while
// the hold is genuinely still on. This mock is file-scoped, which is why the
// suite lives apart from the other rename tests: several of theirs deliberately
// hold a write open longer than this.
vi.mock(import("#webui/lib/constants/transport"), () => ({
  DOC_REQUEST_TIMEOUT_MS: 150,
}));

/**
 * Stub a server that lists `ENTRY`, accepts the rename and never answers it, and
 * echoes every plain save. The rename settles only when the transport's deadline
 * aborts its signal — the way a real fetch behaves, and the whole point here.
 */
function routeFetch(): void {
  typedFetchMock.mockImplementation((url, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return Promise.resolve(jsonResponse({ entries: [ENTRY] }));
    }

    if (url.endsWith("/rename")) {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    }

    return Promise.resolve(jsonResponse({ entry: echoOf(url, init) }));
  });
}

/**
 * The body content of each entry PUT the editor issued.
 * @returns One string per captured write, in dispatch order
 */
function savedBodies(): string[] {
  return entryPuts().map((put) => put.body.content);
}

describe("MemoryScreen — a rename the server never answers", () => {
  it("autosaves the body typed while the rename hung, once it gives up", async () => {
    routeFetch();
    renderMemoryScreen();

    await startRename();

    // Keep typing while the rename is out there. The hold is correct so far — a
    // save now would write the slug the rename is trying to move off of.
    typeBody();
    await settleAutosave();

    expect(savedBodies()).toStrictEqual([]);

    // Once the rename gives up, the draft goes back on the clock. Without a
    // deadline the hold never lifts and this edit — plus every later one — is
    // autosaved nowhere, silently, for the rest of the editor's mount.
    await waitFor(() => {
      expect(savedBodies()).toStrictEqual([EDITED_BODY]);
    });

    // The name field is back on the old slug, so the draft is saving where the
    // list still shows it.
    expect(renameInput().value).toBe(ENTRY.name);

    // And the reason survives that save. The message used to be read off the
    // collection's shared saveError, which every write clears on dispatch — so
    // the autosave just above wiped the only account of what went wrong.
    expect(screen.getByText(/timed out/i)).toBeTruthy();
  });

  it("tells the user the rename timed out", async () => {
    routeFetch();
    renderMemoryScreen();

    await openEntry();
    commitRename();

    expect(await screen.findByText(/timed out/i)).toBeTruthy();

    // Editing the name is the dismissal, same as for any other rename error.
    typeRenameField("Another Slug");

    await waitFor(() => {
      expect(screen.queryByText(/timed out/i)).toBeNull();
    });
  });
});
