/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatStart } from "./ChatStart";

const defaultOverrides = {
  thinking: "Default",
  temperature: 1.0,
  showThoughts: true,
};

describe("ChatStart", () => {
  describe("when mcpStatus is connected", () => {
    it("shows start conversation message", () => {
      const mcpError = "";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="connected"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(
        screen.getByText("Start a conversation with Producer Pal"),
      ).toBeDefined();
    });

    it("shows Quick Connect button", () => {
      const mcpError = "";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="connected"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Quick Connect" }),
      ).toBeDefined();
    });

    it("calls handleSend with Connect to Ableton and overrides when Quick Connect is clicked", () => {
      const mcpError = "";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();
      const overrides = {
        thinking: "High",
        temperature: 0.5,
        showThoughts: false,
      };

      render(
        <ChatStart
          mcpStatus="connected"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={overrides}
        />,
      );

      const button = screen.getByRole("button", { name: "Quick Connect" });

      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledExactlyOnceWith(
        "Connect to Ableton.",
        overrides,
      );
    });

    it("does not show error message", () => {
      const mcpError = "Some error";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="connected"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(screen.queryByText("Producer Pal Not Found")).toBeNull();
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });
  });

  describe("when mcpStatus is error", () => {
    it("shows error heading", () => {
      const mcpError = "Connection failed";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="error"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(screen.getByText("Producer Pal Not Found")).toBeDefined();
    });

    it("shows error message from mcpError prop", () => {
      const mcpError = "Connection failed due to network issue";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="error"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(screen.getByText(mcpError)).toBeDefined();
    });

    it("shows Retry button", () => {
      const mcpError = "Connection failed";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="error"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    });

    it("calls checkMcpConnection when Retry is clicked", () => {
      const mcpError = "Connection failed";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="error"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      const button = screen.getByRole("button", { name: "Retry" });

      fireEvent.click(button);

      expect(checkMcpConnection).toHaveBeenCalledOnce();
    });

    it("does not show Quick Connect button", () => {
      const mcpError = "Connection failed";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="error"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Quick Connect" }),
      ).toBeNull();
    });
  });

  describe("when mcpStatus is connecting", () => {
    it("shows no content", () => {
      const mcpError = "";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();

      render(
        <ChatStart
          mcpStatus="connecting"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
          overrides={defaultOverrides}
        />,
      );

      expect(
        screen.queryByText("Start a conversation with Producer Pal"),
      ).toBeNull();
      expect(screen.queryByText("Producer Pal Not Found")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
