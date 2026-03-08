// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { UserMessageEditor } from "#webui/components/chat/UserMessageEditor";

describe("UserMessageEditor", () => {
  const defaultProps = {
    text: "Hello world",
    onTextChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders textarea with initial text", () => {
    render(<UserMessageEditor {...defaultProps} />);

    const textarea = screen.getByTestId("edit-message-textarea");

    expect((textarea as HTMLTextAreaElement).value).toBe("Hello world");
  });

  it("calls onTextChange when input changes", () => {
    const onTextChange = vi.fn();

    render(<UserMessageEditor {...defaultProps} onTextChange={onTextChange} />);
    fireEvent.input(screen.getByTestId("edit-message-textarea"), {
      target: { value: "New text" },
    });

    expect(onTextChange).toHaveBeenCalledWith("New text");
  });

  it("calls onSave when Enter is pressed", () => {
    const onSave = vi.fn();

    render(<UserMessageEditor {...defaultProps} onSave={onSave} />);
    fireEvent.keyDown(screen.getByTestId("edit-message-textarea"), {
      key: "Enter",
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not call onSave on Enter when text is empty", () => {
    const onSave = vi.fn();

    render(<UserMessageEditor {...defaultProps} text="   " onSave={onSave} />);
    fireEvent.keyDown(screen.getByTestId("edit-message-textarea"), {
      key: "Enter",
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not call onSave on Shift+Enter", () => {
    const onSave = vi.fn();

    render(<UserMessageEditor {...defaultProps} onSave={onSave} />);
    fireEvent.keyDown(screen.getByTestId("edit-message-textarea"), {
      key: "Enter",
      shiftKey: true,
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();

    render(<UserMessageEditor {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByTestId("edit-message-textarea"), {
      key: "Escape",
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();

    render(<UserMessageEditor {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSave when Save & Send button is clicked", () => {
    const onSave = vi.fn();

    render(<UserMessageEditor {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("edit-message-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables Save & Send when text is empty", () => {
    render(<UserMessageEditor {...defaultProps} text="" />);

    const saveButton = screen.getByTestId("edit-message-save");

    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
  });
});
