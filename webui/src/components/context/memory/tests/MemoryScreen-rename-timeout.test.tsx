// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, type Mock, vi } from "vitest";
import { markdownEditorTestMock } from "#webui/components/markdown-editor/tests/markdown-editor-test-mock";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import {
  type MemoryEntryView,
  useMemoryCollection,
} from "#webui/hooks/context/use-memory-collection";
import { MemoryScreen } from "#webui/components/context/memory/MemoryScreen";

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
  COLLECTION_WRITE_TIMEOUT_MS: 400,
}));

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

const ENTRY: MemoryEntryView = {
  name: "prefers-c-minor",
  description: "default key & genre",
  body: "Composes in C minor.",
};

const fetchMock = installFetchMock();

/**
 * The suite's fetch mock under fetch's own signature — `installFetchMock`
 * returns the untyped `vi.fn()`, whose implementations are void-returning.
 */
type FetchMock = Mock<(url: string, init?: RequestInit) => Promise<Response>>;

/** The Memory tab wired to the real collection hook over the stubbed fetch. */
function MemoryScreenHarness(): preact.JSX.Element {
  const collection = useMemoryCollection();

  return <MemoryScreen collection={collection} tabSlot={TAB_SLOT} />;
}

/**
 * Stub a server that lists `ENTRY`, accepts the rename and never answers it, and
 * echoes every plain save. The rename settles only when the transport's deadline
 * aborts its signal — the way a real fetch behaves, and the whole point here.
 */
function routeFetch(): void {
  (fetchMock as unknown as FetchMock).mockImplementation((url, init) => {
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

    const { description, content } = JSON.parse(init?.body as string) as {
      description: string;
      content: string;
    };

    return Promise.resolve(
      jsonResponse({
        entry: { name: url.split("/").pop() ?? "", description, body: content },
      }),
    );
  });
}

/**
 * The entry PUTs the editor issued — the save channel, excluding the rename.
 * @returns One record per captured write, in dispatch order
 */
function entryPuts(): string[] {
  const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];

  return calls
    .filter(([url, init]) => init?.method === "PUT" && !url.endsWith("/rename"))
    .map(([, init]) => {
      const { content } = JSON.parse(init?.body as string) as {
        content: string;
      };

      return content;
    });
}

/**
 * Wait out the editor's idle autosave: preact defers post-paint effects (the
 * arming) to a real timeout that happy-dom's rAF never beats, then the debounce
 * itself runs (mocked to ~0 above). Both directions need the same settle, so
 * whether a save fires is an honest assertion either way.
 */
async function settleAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe("MemoryScreen — a rename the server never answers", () => {
  it("autosaves the body typed while the rename hung, once it gives up", async () => {
    routeFetch();
    render(<MemoryScreenHarness />);

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

    // Keep typing while the rename is out there. The hold is correct so far — a
    // save now would write the slug the rename is trying to move off of.
    fireEvent.input(screen.getByRole("textbox", { name: /Memory/ }), {
      target: { value: "Composes in C minor and F minor." },
    });
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([]);

    // Once the rename gives up, the draft goes back on the clock. Without a
    // deadline the hold never lifts and this edit — plus every later one — is
    // autosaved nowhere, silently, for the rest of the editor's mount.
    await waitFor(() => {
      expect(entryPuts()).toStrictEqual(["Composes in C minor and F minor."]);
    });

    // The name field is back on the old slug, so the draft is saving where the
    // list still shows it.
    expect(screen.getByRole("textbox", { name: "Rename" })).toHaveProperty(
      "value",
      ENTRY.name,
    );
  });

  it("tells the user the rename timed out", async () => {
    routeFetch();
    render(<MemoryScreenHarness />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit prefers-c-minor" }),
    );

    const nameInput = screen.getByRole("textbox", { name: "Rename" });

    fireEvent.input(nameInput, { target: { value: "New Slug" } });
    fireEvent.blur(nameInput);

    expect(await screen.findByText(/timed out/i)).toBeTruthy();
  });
});
