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

describe("makeContextIoHandlers", () => {
  beforeEach(() => {
    downloadTextFile.mockReset();
    pickTextFile.mockReset();
  });

  it("onExport downloads the current content under a dated .md name", () => {
    const { editor } = makeEditor("# my content");
    const { onExport } = makeContextIoHandlers(editor, "producer-pal-global");

    onExport();

    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, content] = downloadTextFile.mock.calls[0] as [
      string,
      string,
    ];

    expect(filename).toMatch(/^producer-pal-global-\d{4}-\d{2}-\d{2}\.md$/);
    expect(content).toBe("# my content");
  });

  it("onImportText forwards text straight to the editor's import", () => {
    const { editor, handleImport } = makeEditor();
    const { onImportText } = makeContextIoHandlers(editor, "base");

    onImportText("dropped body");

    expect(handleImport).toHaveBeenCalledWith("dropped body");
  });

  it("onImport reads a picked file and imports it", async () => {
    pickTextFile.mockResolvedValue("picked body");
    const { editor, handleImport } = makeEditor();
    const { onImport } = makeContextIoHandlers(editor, "base");

    onImport();
    await vi.waitFor(() =>
      expect(handleImport).toHaveBeenCalledWith("picked body"),
    );
    expect(pickTextFile).toHaveBeenCalledWith(fileIo.MARKDOWN_ACCEPT);
  });

  it("onImport is a no-op when the picker is cancelled", async () => {
    pickTextFile.mockResolvedValue(null);
    const { editor, handleImport } = makeEditor();
    const { onImport } = makeContextIoHandlers(editor, "base");

    onImport();
    await Promise.resolve();
    await Promise.resolve();

    expect(handleImport).not.toHaveBeenCalled();
  });
});
