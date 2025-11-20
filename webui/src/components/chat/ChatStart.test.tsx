/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ChatStart } from "./ChatStart.jsx";

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
        />,
      );

      expect(
        screen.getByRole("button", { name: "Quick Connect" }),
      ).toBeDefined();
    });

    it("calls handleSend with Connect to Ableton when Quick Connect is clicked", () => {
      const mcpError = "";
      const checkMcpConnection = vi.fn();
      const handleSend = vi.fn();
      render(
        <ChatStart
          mcpStatus="connected"
          mcpError={mcpError}
          checkMcpConnection={checkMcpConnection}
          handleSend={handleSend}
        />,
      );

      const button = screen.getByRole("button", { name: "Quick Connect" });
      fireEvent.click(button);

      expect(handleSend).toHaveBeenCalledOnce();
      expect(handleSend).toHaveBeenCalledWith("Connect to Ableton.");
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
