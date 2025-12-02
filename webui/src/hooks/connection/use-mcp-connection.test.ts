/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { GeminiClient } from "../../chat/gemini-client";
import { useMcpConnection } from "./use-mcp-connection";

// Mock GeminiClient
// @ts-expect-error - Mock factory doesn't need full class structure
vi.mock(import("../../chat/gemini-client.js"), () => ({
  GeminiClient: {
    testConnection: vi.fn(),
  },
}));

// Type assertion for the mocked method
const mockTestConnection = GeminiClient.testConnection as Mock;

describe("useMcpConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in connecting state", () => {
    mockTestConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    expect(result.current.mcpStatus).toBe("connecting");
    expect(result.current.mcpError).toBe(null);
  });

  it("sets status to connected on successful connection", async () => {
    mockTestConnection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
    expect(mockTestConnection).toHaveBeenCalledOnce();
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";
    mockTestConnection.mockRejectedValue(new Error(errorMessage));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe(errorMessage);
    });
  });

  it("sets error to 'Unknown error' when rejection is not an Error instance", async () => {
    mockTestConnection.mockRejectedValue("string error");
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe("Unknown error");
    });
  });

  it("allows manual reconnection via checkMcpConnection", async () => {
    mockTestConnection.mockRejectedValue(new Error("Initial fail"));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
    });

    mockTestConnection.mockResolvedValue(undefined);
    await result.current.checkMcpConnection();

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
  });
});
