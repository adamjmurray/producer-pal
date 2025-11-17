import { describe, it, expect } from 'vitest';
import { createConnectedMcpPair } from './mcp';

describe('MCP Integration', () => {
  it('should create and connect MCP server and client', async () => {
    const { server, client } = await createConnectedMcpPair();

    expect(server).toBeDefined();
    expect(client).toBeDefined();
    expect(server.isConnected()).toBe(true);
  });

  it('should list all available tools', async () => {
    const { client } = await createConnectedMcpPair();

    const toolsResult = await client.listTools();

    expect(toolsResult.tools).toBeDefined();
    expect(toolsResult.tools.length).toBe(1);

    const toolNames = toolsResult.tools.map(tool => tool.name);
    expect(toolNames).toContain('generate_uuid');
  });

  it('should generate a valid UUID', async () => {
    const { client } = await createConnectedMcpPair();

    const result = await client.callTool({
      name: 'generate_uuid',
      arguments: {},
    });

    expect(result.content).toBeDefined();
    const content = Array.isArray(result.content) ? result.content : [];
    expect(content.length).toBeGreaterThan(0);

    const textContent = content.find(
      (c: { type: string; text?: string }) => c.type === 'text'
    );
    expect(textContent).toBeDefined();

    if (textContent && 'text' in textContent) {
      // Validate UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(textContent.text).toMatch(uuidRegex);
    }
  });

  it('should generate different UUIDs on each call', async () => {
    const { client } = await createConnectedMcpPair();

    const result1 = await client.callTool({
      name: 'generate_uuid',
      arguments: {},
    });

    const result2 = await client.callTool({
      name: 'generate_uuid',
      arguments: {},
    });

    const content1 = Array.isArray(result1.content) ? result1.content : [];
    const content2 = Array.isArray(result2.content) ? result2.content : [];

    const text1 = content1.find(
      (c: { type: string; text?: string }) => c.type === 'text'
    );
    const text2 = content2.find(
      (c: { type: string; text?: string }) => c.type === 'text'
    );

    expect(text1).toBeDefined();
    expect(text2).toBeDefined();

    if (text1 && 'text' in text1 && text2 && 'text' in text2) {
      expect(text1.text).not.toBe(text2.text);
    }
  });
});
