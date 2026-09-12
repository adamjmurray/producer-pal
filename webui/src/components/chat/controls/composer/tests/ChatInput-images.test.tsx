// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "#webui/components/chat/controls/composer/ChatInput";
import {
  MAX_IMAGES_PER_MESSAGE,
  NOT_AN_IMAGE_MESSAGE,
  TOO_MANY_IMAGES_MESSAGE,
} from "#webui/utils/image-attachments";

const DROP_OVERLAY_TEXT = "Drop images to attach";

const defaultProps = {
  handleSend: vi.fn(),
  onEnqueue: vi.fn(),
  isAssistantResponding: false,
  hasError: false,
  onStop: vi.fn(),
  thinking: "Default",
  onThinkingChange: vi.fn(),
};

/**
 * A real file the browser's FileReader can read.
 * @param name - File name
 * @param type - MIME type
 * @returns The file
 */
function makeFile(name: string, type: string): File {
  return new File(["xy"], name, { type });
}

/** The editable region of the chat input. */
const editor = (): HTMLElement => screen.getByRole("textbox");

/**
 * Replace the chat input's text (happy-dom can't type into a contenteditable).
 * @param text - The new text
 */
function typeInput(text: string): void {
  void act(() => {
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  });
}

/**
 * Attach files through the hidden file input, waiting for the reads to land.
 * @param files - Files to attach
 */
async function attachViaPicker(files: File[]): Promise<void> {
  const input = screen.getByTestId("image-file-input") as HTMLInputElement;

  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
  await screen.findByAltText("Attachment 1");
}

describe("ChatInput image attachments", () => {
  it("attaches an image picked with the attach button", async () => {
    render(<ChatInput {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Attach images" })).toBeDefined();
    await attachViaPicker([makeFile("shot.png", "image/png")]);

    expect(screen.getByAltText("Attachment 1")).toBeDefined();
  });

  it("opens the file picker from the attach button", () => {
    render(<ChatInput {...defaultProps} />);

    const picker = screen.getByTestId("image-file-input");
    const click = vi.spyOn(picker, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Attach images" }));

    expect(click).toHaveBeenCalled();
  });

  it("attaches an image pasted into the editor", async () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.paste(editor(), {
      clipboardData: { files: [makeFile("shot.png", "image/png")] },
    });

    expect(await screen.findByAltText("Attachment 1")).toBeDefined();
  });

  it("lets a plain text paste reach the editor, but not an image paste", () => {
    render(<ChatInput {...defaultProps} />);

    const reachedEditor = vi.fn();

    editor().addEventListener("paste", reachedEditor);
    fireEvent.paste(editor(), { clipboardData: { files: [] } });

    expect(reachedEditor).toHaveBeenCalled();
    expect(screen.queryByTestId("image-attachments")).toBeNull();

    reachedEditor.mockClear();
    fireEvent.paste(editor(), {
      clipboardData: { files: [makeFile("a.png", "image/png")] },
    });

    // Intercepted in the capture phase, so CodeMirror never inserts the file.
    expect(reachedEditor).not.toHaveBeenCalled();
  });

  it("attaches an image dropped on the editor", async () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.drop(editor(), {
      dataTransfer: {
        types: ["Files"],
        files: [makeFile("a.png", "image/png")],
      },
    });

    expect(await screen.findByAltText("Attachment 1")).toBeDefined();
  });

  it("shows a drop overlay while files are dragged over, and hides it on leave", () => {
    render(<ChatInput {...defaultProps} />);

    const transfer = { types: ["Files"], files: [] };

    fireEvent.dragEnter(editor(), { dataTransfer: transfer });
    expect(screen.getByText(DROP_OVERLAY_TEXT)).toBeDefined();

    fireEvent.dragOver(editor(), { dataTransfer: transfer });
    expect(screen.getByText(DROP_OVERLAY_TEXT)).toBeDefined();

    fireEvent.dragLeave(editor(), { dataTransfer: transfer });
    expect(screen.queryByText(DROP_OVERLAY_TEXT)).toBeNull();
  });

  it("ignores a drag that carries no files", () => {
    render(<ChatInput {...defaultProps} />);

    const transfer = { types: ["text/plain"], files: [] };

    fireEvent.dragEnter(editor(), { dataTransfer: transfer });
    expect(screen.queryByText(DROP_OVERLAY_TEXT)).toBeNull();

    fireEvent.drop(editor(), { dataTransfer: transfer });
    expect(screen.queryByTestId("image-attachments")).toBeNull();
  });

  it("explains a dropped file that isn't an image", async () => {
    render(<ChatInput {...defaultProps} />);

    fireEvent.drop(editor(), {
      dataTransfer: {
        types: ["Files"],
        files: [makeFile("notes.txt", "text/plain")],
      },
    });

    expect(await screen.findByText(NOT_AN_IMAGE_MESSAGE)).toBeDefined();
  });

  it("explains going over the per-message image cap", async () => {
    render(<ChatInput {...defaultProps} />);

    await attachViaPicker(
      Array.from({ length: MAX_IMAGES_PER_MESSAGE + 1 }, (_, i) =>
        makeFile(`${i}.png`, "image/png"),
      ),
    );

    expect(await screen.findByText(TOO_MANY_IMAGES_MESSAGE)).toBeDefined();
    expect(screen.getAllByAltText(/^Attachment /)).toHaveLength(
      MAX_IMAGES_PER_MESSAGE,
    );
  });

  it("removes an attachment", async () => {
    render(<ChatInput {...defaultProps} />);

    await attachViaPicker([makeFile("a.png", "image/png")]);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attachment 1" }),
    );

    expect(screen.queryByAltText("Attachment 1")).toBeNull();
  });

  it("sends images with no text, then clears them", async () => {
    const handleSend = vi.fn();

    render(<ChatInput {...defaultProps} handleSend={handleSend} />);
    await attachViaPicker([makeFile("a.png", "image/png")]);

    const send = screen.getByRole("button", {
      name: "Send",
    }) as HTMLButtonElement;

    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(handleSend).toHaveBeenCalledExactlyOnceWith(
      { text: "", images: [{ mediaType: "image/png", data: "eHk=" }] },
      { thinking: "Default" },
    );
    expect(screen.queryByAltText("Attachment 1")).toBeNull();
  });

  it("sends images alongside typed text", async () => {
    const handleSend = vi.fn();

    render(<ChatInput {...defaultProps} handleSend={handleSend} />);
    await attachViaPicker([makeFile("a.png", "image/png")]);
    typeInput("match this");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(handleSend).toHaveBeenCalledExactlyOnceWith(
      {
        text: "match this",
        images: [{ mediaType: "image/png", data: "eHk=" }],
      },
      { thinking: "Default" },
    );
  });

  it("queues images while the assistant is responding", async () => {
    const onEnqueue = vi.fn();

    render(
      <ChatInput
        {...defaultProps}
        onEnqueue={onEnqueue}
        isAssistantResponding={true}
      />,
    );
    await attachViaPicker([makeFile("a.png", "image/png")]);
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    expect(onEnqueue).toHaveBeenCalledExactlyOnceWith(
      { text: "", images: [{ mediaType: "image/png", data: "eHk=" }] },
      { thinking: "Default" },
    );
  });
});
