// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  type Deferred,
  deferred,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { type MemoryEntryView } from "#webui/hooks/context/use-memory-collection";
import { markdownEditorTestMock } from "#webui/components/markdown-editor/tests/markdown-editor-test-mock";
import {
  EDITED_BODY,
  commitRename,
  ENTRY,
  entryPuts,
  fetchMock,
  fieldValue,
  openEntry,
  OTHER,
  RENAMED,
  renameInput,
  renderMemoryScreen,
  serveEchoingSaves,
  settleAutosave,
  startRename,
  typeBody,
  typedFetchMock,
} from "./memory-rename-test-helpers";

// Stub the CodeMirror body editor for happy-dom; see markdown-editor-test-mock.
vi.mock(import("#webui/components/markdown-editor/MarkdownEditor"), () =>
  markdownEditorTestMock(),
);

// Shrink the autosave debounce so settleAutosave() only has to outwait preact's
// deferred effect, not a real 800ms idle window on every test.
vi.mock(import("#webui/lib/constants/autosave"), () => ({
  VOICE_AUTOSAVE_DEBOUNCE_MS: 1,
  CONTEXT_EDITOR_SAVE_DEBOUNCE_MS: 1,
  DOC_COLLECTION_AUTOSAVE_DEBOUNCE_MS: 1,
}));

/** A write the fake server has received but not yet applied. */
interface PendingWrite {
  /** The request URL (the rename channel ends in `/rename`). */
  url: string;
  /** Apply this write to the store and answer its request. */
  land: () => void;
}

/**
 * A fake memory server holding every write until the test lands it, so the
 * ordering of two racing writes is the test's to choose rather than the mock's.
 * Its store is the "files on disk" the assertions read.
 * @returns The store and the queue of unlanded writes
 */
function fakeServer(): {
  store: Map<string, MemoryEntryView>;
  pending: PendingWrite[];
} {
  const store = new Map<string, MemoryEntryView>([[ENTRY.name, ENTRY]]);
  const pending: PendingWrite[] = [];

  typedFetchMock.mockImplementation((url, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return Promise.resolve(jsonResponse({ entries: [...store.values()] }));
    }

    const body = JSON.parse(init?.body as string) as {
      description: string;
      content: string;
      newName?: string;
    };
    const isRename = url.endsWith("/rename");
    const slug =
      url
        .replace(/\/rename$/, "")
        .split("/")
        .pop() ?? "";
    // The server slugifies a rename's target; a plain save writes its URL slug.
    const target = isRename
      ? (body.newName ?? "").trim().toLowerCase().replaceAll(/\W+/g, "-")
      : slug;
    const entry: MemoryEntryView = {
      name: target,
      description: body.description,
      body: body.content,
    };
    const response = deferred<Response>();

    pending.push({
      url,
      land: () => {
        // A rename writes the new slug and drops the old one; a save is an
        // upsert, which is exactly why a stale one re-creates a moved entry.
        if (isRename) store.delete(slug);
        store.set(target, entry);
        response.resolve(jsonResponse({ entry }));
      },
    });

    return response.promise;
  });

  return { store, pending };
}

/**
 * Queue the stubbed fetch for one rename round trip: the mount GET lists
 * `mount`, the rename PUT hangs on a deferred the test resolves, and a
 * stateless echoing server answers everything after that.
 * @param mount - What the mount GET lists
 * @param listAfter - What later GETs list; a refused rename leaves the old slug
 * @returns The rename PUT's deferred response
 */
function routeFetch(
  mount: MemoryEntryView[] = [ENTRY],
  listAfter: MemoryEntryView[] = [RENAMED],
): Deferred<Response> {
  const renamePut = deferred<Response>();

  fetchMock.mockResolvedValueOnce(jsonResponse({ entries: mount }));
  fetchMock.mockReturnValueOnce(renamePut.promise);
  serveEchoingSaves(listAfter);

  return renamePut;
}

/**
 * Like {@link routeFetch}, but the mount GET lists a second memory to navigate
 * to while the rename is open.
 * @param listAfter - What later GETs list; a refused rename leaves the old slug
 * @returns The rename PUT's deferred response
 */
function routeFetchWithOther(
  listAfter: MemoryEntryView[] = [RENAMED, OTHER],
): Deferred<Response> {
  return routeFetch([ENTRY, OTHER], listAfter);
}

/**
 * The rename PUTs the editor issued, in dispatch order.
 * @returns The old slug each one named, and the new name it asked for
 */
function renamePuts(): { slugInUrl: string; newName: string }[] {
  const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];

  return calls
    .filter(([url, init]) => init?.method === "PUT" && url.endsWith("/rename"))
    .map(([url, init]) => ({
      slugInUrl:
        url
          .replace(/\/rename$/, "")
          .split("/")
          .pop() ?? "",
      newName: (JSON.parse(init?.body as string) as { newName: string })
        .newName,
    }));
}

/** Open the second memory, unmounting the editor that holds the draft. */
function openOther(): void {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${OTHER.name}` }));
}

/** Wait for the list to follow the rename to its new slug. */
async function awaitRenamedInList(): Promise<void> {
  await screen.findByRole("button", { name: `Edit ${RENAMED.name}` });
}

describe("MemoryScreen — editing during an in-flight rename", () => {
  it("keeps the draft typed while the rename was in flight and saves it under the new slug", async () => {
    const renamePut = routeFetch();

    renderMemoryScreen();

    await startRename();

    // The rename round trip is open — keep typing into the body and the
    // description (the latter is a controlled input, so a remount that re-seeds
    // from the server's pre-edit echo is visible in the DOM).
    typeBody();
    fireEvent.input(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "edited mid-rename" },
    });

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    // The list (and the editor) follow the entry to its slugified new name…
    await awaitRenamedInList();
    expect(fieldValue("Rename")).toBe("new-slug");
    // …carrying the in-flight edits rather than snapping back to the echo.
    expect(fieldValue(/Description/)).toBe("edited mid-rename");

    // And the carried draft is really persisted — the autosave commits it under
    // the NEW slug, since the rename's echo left the draft legitimately dirty.
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([
      {
        url: expect.stringContaining("new-slug") as string,
        body: { description: "edited mid-rename", content: EDITED_BODY },
      },
    ]);
  });

  it("does not re-save an untouched entry after a rename", async () => {
    const renamePut = routeFetch();

    renderMemoryScreen();

    await startRename();

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();

    // The rename's own echo is the new baseline, so an untouched draft is clean:
    // following the entry to its new slug must not trigger a redundant write.
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([]);
  });

  it("still retries a failed autosave after a rename", async () => {
    const renamePut = routeFetch();

    const { unmount } = renderMemoryScreen();

    await startRename();
    renamePut.resolve(jsonResponse({ entry: RENAMED }));
    await awaitRenamedInList();

    // Fail the next save. A rename passes through one render with no entry,
    // which used to re-run the unmount effect and latch the editor "unmounted"
    // — after which a failed save never rolled its baseline back and the draft
    // read as saved.
    let failNextSave = true;

    typedFetchMock.mockImplementation((_url, init) => {
      if ((init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse({ entries: [RENAMED] }));
      }

      if (failNextSave) {
        failNextSave = false;

        return Promise.reject(new Error("network down"));
      }

      return Promise.resolve(jsonResponse({ entry: RENAMED }));
    });

    typeBody();
    await settleAutosave();

    expect(entryPuts()).toHaveLength(1);

    // Closing the editor has to retry the lost write, not drop the edit.
    unmount();

    await waitFor(() => {
      expect(entryPuts()).toHaveLength(2);
    });
  });

  it("never leaves the deleted-externally banner paintable", async () => {
    const renamePut = routeFetch();

    renderMemoryScreen();

    await startRename();

    // Dropping the old slug from the list and moving the selection to the new
    // one are two separate state updates, so the entry momentarily resolves to
    // null and CollectionScreen's deleted-externally banner mounts. Both are
    // microtasks in the same task, and a browser paints only BETWEEN tasks — so
    // sample at the first macrotask boundary after the rename lands: the banner
    // must already be gone. An `await` on I/O inserted between those updates
    // would split the task and make the banner genuinely visible.
    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    const bannerAtNextTask = await new Promise<boolean>((resolve) => {
      setTimeout(
        () =>
          resolve(
            document.body.textContent.includes("deleted outside the editor"),
          ),
        0,
      );
    });

    expect(bannerAtNextTask).toBe(false);
    await awaitRenamedInList();
  });
});

describe("MemoryScreen — navigating away during a rename", () => {
  it("leaves the newly opened memory alone when the rename lands", async () => {
    const renamePut = deferred<Response>();

    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [ENTRY, OTHER] }));
    fetchMock.mockReturnValueOnce(renamePut.promise);
    fetchMock.mockResolvedValue(
      jsonResponse({ entries: [RENAMED, OTHER], entry: RENAMED }),
    );

    renderMemoryScreen();

    await startRename();

    // Blur committed the rename; the click that caused it opens another memory,
    // so the mounted editor is now on OTHER when the rename resolves.
    openOther();

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();

    // Following the rename here would point this editor at the renamed entry
    // WITHOUT remounting it, and its idle autosave would then write OTHER's
    // fields over that entry. Every write must stay on the entry the user is
    // actually looking at.
    await settleAutosave();

    expect(fieldValue("Rename")).toBe(OTHER.name);
    expect(entryPuts().map((put) => put.url)).not.toContain(
      expect.stringContaining("new-slug"),
    );

    for (const put of entryPuts()) {
      expect(put.url).toContain(OTHER.name);
      expect(put.body.description).toBe(OTHER.description);
    }
  });

  it("saves an edit typed during the rename after the editor closes", async () => {
    // Closing mid-rename is the one gap the autosave hold leaves: it suppresses
    // the unmount flush too, and resumePendingSave then bails on the gone
    // editor, so this edit used to reach disk nowhere.
    const renamePut = routeFetchWithOther();

    renderMemoryScreen();

    await startRename();

    // Typed AFTER the rename PUT went out, so the rename's own body doesn't
    // carry it and only a later save can.
    typeBody();

    // Opening another memory unmounts the editor holding that edit.
    openOther();

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([
      {
        url: expect.stringContaining("new-slug") as string,
        body: { description: ENTRY.description, content: EDITED_BODY },
      },
    ]);
  });

  it("saves that edit under the old slug when the rename is refused", async () => {
    // A refusal leaves the entry exactly where it was, so the draft still has a
    // live slug to land on. Bailing here lost it: the refused write saved
    // nothing, and the hold had already suppressed the unmount flush.
    const renamePut = routeFetchWithOther([ENTRY, OTHER]);

    renderMemoryScreen();

    await startRename();

    typeBody();
    openOther();

    renamePut.resolve(
      new Response(JSON.stringify({ error: "new-slug already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await settleAutosave();

    expect(entryPuts()).toStrictEqual([
      {
        url: expect.stringContaining(ENTRY.name) as string,
        body: { description: ENTRY.description, content: EDITED_BODY },
      },
    ]);
  });

  it("writes nothing when the closed draft matches the rename's echo", async () => {
    const renamePut = routeFetchWithOther();

    renderMemoryScreen();

    await startRename();
    openOther();
    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([]);
  });

  it("writes nothing when the closed draft is one the autosave would refuse", async () => {
    const renamePut = routeFetchWithOther();

    renderMemoryScreen();

    await startRename();

    // An empty body is exactly what the idle autosave refuses to write. This
    // write stands in for that autosave, so it has to refuse the same draft.
    typeBody("");
    openOther();
    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();
    await settleAutosave();

    expect(entryPuts()).toStrictEqual([]);
  });
});

describe("MemoryScreen — renaming with an autosave of the old slug in flight", () => {
  it("waits for the in-flight save to land before renaming, so it can't re-create the old slug", async () => {
    const { store, pending } = fakeServer();

    renderMemoryScreen();

    await openEntry();

    // Typing arms the idle autosave, which is keyed to the entry's CURRENT
    // slug. Let it fire: its PUT to `prefers-c-minor` is now in flight.
    typeBody();

    await waitFor(() => {
      expect(pending).toHaveLength(1);
    });
    expect(pending[0]?.url).toContain(ENTRY.name);

    // Rename while that save is still open. Dispatching now would leave two
    // writes racing for one file, and the server landing the rename first would
    // let the save re-create the entry the rename just moved away from.
    commitRename();
    await settleAutosave();

    expect(pending).toHaveLength(1);

    // Once the save lands, the rename goes out — against a settled old slug.
    pending[0]?.land();

    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    expect(pending[1]?.url).toContain("/rename");

    pending[1]?.land();

    await awaitRenamedInList();
    expect([...store.keys()]).toStrictEqual(["new-slug"]);
  });
});

describe("MemoryScreen — a second rename while one is in flight", () => {
  it("refuses the second commit instead of dispatching a stale slug", async () => {
    // The list commits a rename only on success, so the `entry` prop still
    // reads the OLD slug at the second blur — the second rename named the slug
    // the first one was already moving, and its failure then reverted the name
    // field, silently undoing the rename that did land.
    const renamePut = routeFetch();

    renderMemoryScreen();

    await startRename();

    expect(renameInput().disabled).toBe(true);

    commitRename("Another Slug");
    await settleAutosave();

    expect(renamePuts()).toStrictEqual([
      { slugInUrl: ENTRY.name, newName: "New Slug" },
    ]);

    renamePut.resolve(jsonResponse({ entry: RENAMED }));

    await awaitRenamedInList();
    expect(renameInput().disabled).toBe(false);
    expect(fieldValue("Rename")).toBe("new-slug");
  });
});
