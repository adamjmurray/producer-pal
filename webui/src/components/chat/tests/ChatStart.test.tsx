// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import {
  type RenderResult,
  render,
  screen,
  fireEvent,
} from "@testing-library/preact";
import { type Mock, describe, expect, it, vi } from "vitest";
import {
  type ChatStartProps,
  ChatStart,
} from "#webui/components/chat/ChatStart";

const defaultOverrides = {
  thinking: "Default",
};

type RenderProps = Partial<ChatStartProps> & {
  checkMcpConnection?: Mock;
  handleSend?: Mock;
  onSetUpChat?: Mock;
};

function renderChatStart(props: RenderProps = {}): RenderResult & {
  checkMcpConnection: Mock;
  handleSend: Mock;
  onSetUpChat: Mock;
} {
  const checkMcpConnection = props.checkMcpConnection ?? vi.fn();
  const handleSend = props.handleSend ?? vi.fn();
  const onSetUpChat = props.onSetUpChat ?? vi.fn();
  const result = render(
    <ChatStart
      mcpStatus={props.mcpStatus ?? "connected"}
      mcpError={props.mcpError ?? ""}
      chatSetUp={props.chatSetUp ?? true}
      onSetUpChat={onSetUpChat}
      checkMcpConnection={checkMcpConnection}
      handleSend={handleSend}
      overrides={props.overrides ?? defaultOverrides}
    />,
  );

  return { ...result, checkMcpConnection, handleSend, onSetUpChat };
}

describe("ChatStart", () => {
  describe("when chat is not set up", () => {
    it("offers Set up chat instead of Quick Connect", () => {
      const { onSetUpChat, handleSend } = renderChatStart({
        chatSetUp: false,
      });

      expect(
        screen.queryByRole("button", { name: "Quick Connect" }),
      ).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Set up chat" }));

      expect(onSetUpChat).toHaveBeenCalledOnce();
      expect(handleSend).not.toHaveBeenCalled();
    });

    it("still shows the Producer Pal error", () => {
      renderChatStart({
        chatSetUp: false,
        mcpStatus: "error",
        mcpError: "boom",
      });

      expect(screen.getByText("Producer Pal Not Found")).toBeDefined();
      expect(screen.getByRole("button", { name: "Set up chat" })).toBeDefined();
    });
  });

  it("does not offer Set up chat once chat is set up", () => {
    renderChatStart();

    expect(screen.queryByRole("button", { name: "Set up chat" })).toBeNull();
  });

  describe("when mcpStatus is connected", () => {
    it("shows start conversation message", () => {
      renderChatStart();
      expect(
        screen.getByText("Start a conversation with Producer Pal"),
      ).toBeDefined();
    });

    it("shows Quick Connect button", () => {
      renderChatStart();
      expect(
        screen.getByRole("button", { name: "Quick Connect" }),
      ).toBeDefined();
    });

    it("calls handleSend with Connect to Ableton and overrides when Quick Connect is clicked", () => {
      const overrides = {
        thinking: "Max",
      };
      const { handleSend } = renderChatStart({ overrides });

      fireEvent.click(screen.getByRole("button", { name: "Quick Connect" }));
      expect(handleSend).toHaveBeenCalledExactlyOnceWith(
        "Connect to Ableton.",
        overrides,
      );
    });

    it("does not show error message", () => {
      renderChatStart({ mcpError: "Some error" });
      expect(screen.queryByText("Producer Pal Not Found")).toBeNull();
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });
  });

  describe("when mcpStatus is error", () => {
    const errorProps = {
      mcpStatus: "error" as const,
      mcpError: "Connection failed",
    };

    it("shows error heading", () => {
      renderChatStart(errorProps);
      expect(screen.getByText("Producer Pal Not Found")).toBeDefined();
    });

    it("shows error message from mcpError prop", () => {
      const mcpError = "Connection failed due to network issue";

      renderChatStart({ mcpStatus: "error", mcpError });
      expect(screen.getByText(mcpError)).toBeDefined();
    });

    it("shows Retry button", () => {
      renderChatStart(errorProps);
      expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    });

    it("calls checkMcpConnection when Retry is clicked", () => {
      const { checkMcpConnection } = renderChatStart(errorProps);

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(checkMcpConnection).toHaveBeenCalledOnce();
    });

    it("does not show Quick Connect button", () => {
      renderChatStart(errorProps);
      expect(
        screen.queryByRole("button", { name: "Quick Connect" }),
      ).toBeNull();
    });
  });

  describe("when mcpStatus is connecting", () => {
    it("shows no content", () => {
      renderChatStart({ mcpStatus: "connecting" });
      expect(
        screen.queryByText("Start a conversation with Producer Pal"),
      ).toBeNull();
      expect(screen.queryByText("Producer Pal Not Found")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
