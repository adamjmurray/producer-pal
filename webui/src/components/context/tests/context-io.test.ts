// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EditorIoTarget,
  makeContextIoHandlers,
} from "#webui/components/context/context-io";
import * as fileIo from "#webui/utils/text-file-io";

vi.mock(import("#webui/utils/text-file-io"), async (importOriginal) => ({
  ...(await importOriginal()),
  downloadTextFile: vi.fn(),
  pickTextFile: vi.fn(),
}));

const downloadTextFile = vi.mocked(fileIo.downloadTextFile);
const pickTextFile = vi.mocked(fileIo.pickTextFile);

/**
 * Build a stub editor-state target that records import calls.
 * @param content - The content getContent() should return
 * @returns The editor stub and its handleImport spy
 */
function makeEditor(content = "current"): {
  editor: EditorIoTarget;
  handleImport: ReturnType<typeof vi.fn>;
} {
  const handleImport = vi.fn().mockResolvedValue(undefined);

  return {
    editor: {
      handleImport: handleImport as unknown as EditorIoTarget["handleImport"],
      getContent: () => content,
    },
    handleImport,
  };
}

/**
 * Run an import that the picker refuses and assert the failure reached
 * onImportError rather than the editor.
 * @param message - The message the picker's refusal maps to
 */
async function expectImportError(message: string): Promise<void> {
  const { editor, handleImport } = makeEditor();
  const onImportError = vi.fn();
  const { onImport } = makeContextIoHandlers({
    editor,
    exportBasename: "base",
    onImportError,
  });

  onImport();
  await vi.waitFor(() => expect(onImportError).toHaveBeenCalledWith(message));
  expect(handleImport).not.toHaveBeenCalled();
}

describe("makeContextIoHandlers", () => {
  beforeEach(() => {
    downloadTextFile.mockReset();
    pickTextFile.mockReset();
  });

  it("onExport downloads the current content under a dated .md name", () => {
    const { editor } = makeEditor("# my content");
    const { onExport } = makeContextIoHandlers({
      editor,
      exportBasename: "producer-pal-global",
    });

    onExport();

    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, content] = downloadTextFile.mock.calls[0] as [
      string,
      string,
    ];

    expect(filename).toMatch(/^producer-pal-global-\d{4}-\d{2}-\d{2}\.md$/);
    expect(content).toBe("# my content");
  });

  it("onExport falls back to the built-in an un-customized pane is showing", () => {
    // The draft is seeded from the stored override, which is empty until the
    // user forks — but the pane is displaying the default, so exporting the
    // empty draft would download a 0-byte file from a screen full of text.
    const { editor } = makeEditor("");
    const { onExport } = makeContextIoHandlers({
      editor,
      exportBasename: "producer-pal-skill-standard",
      builtIn: "# The shipped default",
    });

    onExport();

    expect(downloadTextFile.mock.calls[0]?.[1]).toBe("# The shipped default");
  });

  it("onExport prefers the user's own content over the built-in", () => {
    const { editor } = makeEditor("# my fork");
    const { onExport } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
      builtIn: "# The shipped default",
    });

    onExport();

    expect(downloadTextFile.mock.calls[0]?.[1]).toBe("# my fork");
  });

  it("onImportText forwards text straight to the editor's import", () => {
    const { editor, handleImport } = makeEditor();
    const { onImportText } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
    });

    onImportText("dropped body");

    expect(handleImport).toHaveBeenCalledWith("dropped body");
  });

  it("onImportText fires onImportSuccess so a stale notice is cleared", () => {
    const { editor, handleImport } = makeEditor();
    const onImportSuccess = vi.fn();
    const { onImportText } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
      onImportSuccess,
    });

    onImportText("dropped body");

    expect(onImportSuccess).toHaveBeenCalledOnce();
    expect(handleImport).toHaveBeenCalledWith("dropped body");
  });

  it("onImport fires onImportSuccess on a successful pick", async () => {
    pickTextFile.mockResolvedValue({ kind: "text", text: "picked body" });
    const { editor } = makeEditor();
    const onImportSuccess = vi.fn();
    const { onImport } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
      onImportSuccess,
    });

    onImport();

    await vi.waitFor(() => expect(onImportSuccess).toHaveBeenCalledOnce());
  });

  it("onImport reads a picked file and imports it", async () => {
    pickTextFile.mockResolvedValue({ kind: "text", text: "picked body" });
    const { editor, handleImport } = makeEditor();
    const { onImport } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
    });

    onImport();
    await vi.waitFor(() =>
      expect(handleImport).toHaveBeenCalledWith("picked body"),
    );
    expect(pickTextFile).toHaveBeenCalledWith(fileIo.MARKDOWN_ACCEPT);
  });

  it("onImport is a no-op when the picker is cancelled", async () => {
    pickTextFile.mockResolvedValue({ kind: "cancel" });
    const { editor, handleImport } = makeEditor();
    const onImportError = vi.fn();
    const { onImport } = makeContextIoHandlers({
      editor,
      exportBasename: "base",
      onImportError,
    });

    onImport();
    await Promise.resolve();
    await Promise.resolve();

    expect(handleImport).not.toHaveBeenCalled();
    expect(onImportError).not.toHaveBeenCalled();
  });

  it("onImport reports an oversized pick to onImportError, not the editor", async () => {
    pickTextFile.mockResolvedValue({ kind: "too-large" });
    await expectImportError(fileIo.TOO_LARGE_MESSAGE);
  });

  it("onImport reports an unreadable pick to onImportError", async () => {
    pickTextFile.mockResolvedValue({ kind: "read-error" });
    await expectImportError(fileIo.READ_ERROR_MESSAGE);
  });
});
