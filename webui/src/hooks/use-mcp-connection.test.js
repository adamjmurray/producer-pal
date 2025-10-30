/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { useMcpConnection } from "./use-mcp-connection.js";
import { GeminiChat } from "./gemini-chat.js";

// Mock GeminiChat
vi.mock(import("./gemini-chat.js"), () => ({
  GeminiChat: {
    testConnection: vi.fn(),
  },
}));

describe("useMcpConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in connecting state", () => {
    GeminiChat.testConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    expect(result.current.mcpStatus).toBe("connecting");
    expect(result.current.mcpError).toBe("");
  });

  it("sets status to connected on successful connection", async () => {
    GeminiChat.testConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
    expect(GeminiChat.testConnection).toHaveBeenCalledOnce();
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";
    GeminiChat.testConnection.mockRejectedValue(new Error(errorMessage));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe(errorMessage);
    });
  });

  it("allows manual reconnection via checkMcpConnection", async () => {
    GeminiChat.testConnection.mockRejectedValue(new Error("Initial fail"));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
    });

    GeminiChat.testConnection.mockResolvedValue(undefined);
    await result.current.checkMcpConnection();

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
  });
});
