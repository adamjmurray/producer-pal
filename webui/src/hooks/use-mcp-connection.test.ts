/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { useMcpConnection } from "./use-mcp-connection.js";
import { GeminiClient } from "../chat/gemini-client.js";

// Mock GeminiClient
vi.mock(import("../chat/gemini-client.js"), () => ({
  GeminiClient: {
    testConnection: vi.fn(),
  },
}));

describe("useMcpConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in connecting state", () => {
    GeminiClient.testConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    expect(result.current.mcpStatus).toBe("connecting");
    expect(result.current.mcpError).toBe(null);
  });

  it("sets status to connected on successful connection", async () => {
    GeminiClient.testConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
    expect(GeminiClient.testConnection).toHaveBeenCalledOnce();
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";
    GeminiClient.testConnection.mockRejectedValue(new Error(errorMessage));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe(errorMessage);
    });
  });

  it("allows manual reconnection via checkMcpConnection", async () => {
    GeminiClient.testConnection.mockRejectedValue(new Error("Initial fail"));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
    });

    GeminiClient.testConnection.mockResolvedValue(undefined);
    await result.current.checkMcpConnection();

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
  });
});
