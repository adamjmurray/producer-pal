// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared rig for the MemoryScreen rename suites. They live in separate files
// because the timeout suite mocks the transport deadline file-wide, but they
// drive the same screen the same way, so the fixtures and drivers live here.
// Callers keep their own `@vitest-environment happy-dom` directive and their own
// `vi.mock` calls — both must be file-level.

import {
  fireEvent,
  render,
  type RenderResult,
  screen,
  waitFor,
} from "@testing-library/preact";
import { expect, type Mock } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { type MemoryEntryView } from "#webui/hooks/context/use-memory-collection";
import { flushTurns } from "#webui/test-utils/dom-test-helpers";
import { MemoryScreenHarness } from "./memory-screen-harness";

export const ENTRY: MemoryEntryView = {
  name: "prefers-c-minor",
  description: "default key & genre",
  body: "Composes in C minor.",
};

/** The server's echo of the rename: the same fields under the new slug. */
export const RENAMED: MemoryEntryView = { ...ENTRY, name: "new-slug" };

/** A second memory, for navigating away while a rename is in flight. */
export const OTHER: MemoryEntryView = {
  name: "likes-swing",
  description: "groove",
  body: "Swing everything.",
};

/** The body text every test types into the open editor. */
export const EDITED_BODY = "Composes in C minor and F minor.";

/**
 * The suite's fetch mock under fetch's own signature — `installFetchMock`
 * returns the untyped `vi.fn()`, whose implementations are void-returning.
 */
export type FetchMock = Mock<
  (url: string, init?: RequestInit) => Promise<Response>
>;

/** One captured entry PUT (the autosave/create channel, not the rename one). */
export interface CapturedSave {
  url: string;
  body: { description: string; content: string };
}

/**
 * The stubbed `fetch` shared by both rename suites. Importing this module
 * registers its install/teardown hooks on the importing file's suite.
 */
export const fetchMock = installFetchMock();

/** The same mock typed as fetch, for `mockImplementation` calls. */
export const typedFetchMock = fetchMock as unknown as FetchMock;

/**
 * Mount the Memory tab over the REAL collection hook, so a rename runs its true
 * round trip: the list commit lands in one microtask and the caller's
 * navigation in the next. The screen-level fakes elsewhere can't express that
 * ordering, which is exactly where the dropped-draft bug lived.
 * @returns The render result (for `unmount`)
 */
export function renderMemoryScreen(): RenderResult {
  return render(<MemoryScreenHarness />);
}

/**
 * The entry a write's response echoes: the fields it sent, under its URL slug.
 * @param url - The request URL
 * @param init - The request options carrying the JSON body
 * @returns The entry the server echoes back
 */
export function echoOf(
  url: string,
  init: RequestInit | undefined,
): MemoryEntryView {
  const { description, content } = JSON.parse(init?.body as string) as {
    description: string;
    content: string;
  };

  return { name: url.split("/").pop() ?? "", description, body: content };
}

/**
 * The entry PUTs the editor issued — the save channel, excluding the rename.
 * @returns One record per captured write, in dispatch order
 */
export function entryPuts(): CapturedSave[] {
  const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];

  return calls
    .filter(([url, init]) => init?.method === "PUT" && !url.endsWith("/rename"))
    .map(([url, init]) => ({
      url,
      body: JSON.parse(init?.body as string) as CapturedSave["body"],
    }));
}

/**
 * The rename input, which is disabled for the length of a rename round trip.
 * @returns The name field element
 */
export function renameInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Rename" }) as HTMLInputElement;
}

/**
 * The current value of a textbox in the open editor.
 * @param name - The field's accessible name
 * @returns The input's value
 */
export function fieldValue(name: string | RegExp): string {
  return (screen.getByRole("textbox", { name }) as HTMLInputElement).value;
}

/** Type into the open editor's body field. */
export function typeBody(value = EDITED_BODY): void {
  fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
    target: { value },
  });
}

/** Open `ENTRY` in the right pane. */
export async function openEntry(): Promise<void> {
  fireEvent.click(
    await screen.findByRole("button", { name: `Edit ${ENTRY.name}` }),
  );
}

/**
 * Type into the rename field without committing — the editor treats an edit
 * there as the dismissal of a previous rename error.
 * @param newName - The name to type
 */
export function typeRenameField(newName: string): void {
  fireEvent.input(renameInput(), { target: { value: newName } });
}

/**
 * Commit a rename of the open entry by typing a name and blurring the field.
 * @param newName - The name to type; the server slugifies it
 */
export function commitRename(newName = "New Slug"): void {
  typeRenameField(newName);
  fireEvent.blur(renameInput());
}

/**
 * Open `ENTRY` and commit a rename to "New Slug" (which the server slugifies to
 * `RENAMED`) whose PUT is left in flight.
 */
export async function startRename(): Promise<void> {
  await openEntry();
  commitRename();

  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rename")),
    ).toBe(true);
  });
}

/**
 * Wait out the editor's idle autosave: preact defers the arming to a post-paint
 * effect, then the debounce itself runs (mocked to ~0 by the caller). Both
 * directions need the same settle, so whether a save fires is an honest
 * assertion either way — and one turn is not enough to reach the write.
 */
export async function settleAutosave(): Promise<void> {
  await flushTurns();
}

/**
 * A stateless server for everything after a suite's queued responses: GETs list
 * `listAfter`, and a save echoes what it wrote, like the real server. Echoing a
 * fixed entry would advance the autosave baseline to content the editor never
 * had, so every saved draft would read dirty and flush again on unmount.
 * @param listAfter - What later GETs list
 */
export function serveEchoingSaves(listAfter: MemoryEntryView[]): void {
  typedFetchMock.mockImplementation((url, init) =>
    Promise.resolve(
      (init?.method ?? "GET") === "GET"
        ? jsonResponse({ entries: listAfter })
        : jsonResponse({ entry: echoOf(url, init) }),
    ),
  );
}
