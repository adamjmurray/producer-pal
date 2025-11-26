import { describe, it, expect } from "vitest";
import { tool } from "@openai/agents/realtime";
import {
  createVoiceAgent,
  VOICE_AGENT_INSTRUCTIONS,
} from "./voice-agent-config";

describe("voice-agent-config", () => {
  describe("VOICE_AGENT_INSTRUCTIONS", () => {
    it("should include core personality description", () => {
      expect(VOICE_AGENT_INSTRUCTIONS).toContain("Producer Pal");
      expect(VOICE_AGENT_INSTRUCTIONS).toContain("Ableton Live");
    });

    it("should include guidance for using supervisor", () => {
      expect(VOICE_AGENT_INSTRUCTIONS).toContain(
        "getNextResponseFromSupervisor",
      );
    });
  });

  describe("createVoiceAgent", () => {
    it("should create an agent with the supervisor tool", () => {
      const mockSupervisorTool = tool({
        name: "getNextResponseFromSupervisor",
        description: "Test supervisor tool",
        parameters: {
          type: "object",
          properties: {
            relevantContextFromLastUserMessage: {
              type: "string",
              description: "Test context",
            },
          },
          required: ["relevantContextFromLastUserMessage"],
          additionalProperties: false,
        },
        execute: async () => ({ nextResponse: "test" }),
      });

      const agent = createVoiceAgent(mockSupervisorTool);
      expect(agent).toBeDefined();
      expect(agent.name).toBe("producerPal");
    });
  });
});
