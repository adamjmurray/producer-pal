/**
 * Tool definitions for voice chat
 */

import type { Schema } from '@google/genai';
import { Type } from '@google/genai';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Schema;
}

export interface ToolResult {
  output: string;
}

/**
 * Tool definitions compatible with Gemini Live API
 */
export const tools: ToolDefinition[] = [
  {
    name: 'generate_uuid',
    description: 'Generates a random UUID (v4)',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: [],
    },
  },
];

/**
 * Execute a tool by name
 * @param name
 * @param _args
 */
export async function executeTool(name: string, _args: Record<string, unknown> = {}): Promise<ToolResult> {
  switch (name) {
    case 'generate_uuid':
      return {
        output: crypto.randomUUID(),
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
