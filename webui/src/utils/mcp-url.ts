const VITE_DEV_PORT = "5173";
const DEFAULT_MCP_PORT = "3350";
const DEFAULT_MCP_URL = `http://localhost:${DEFAULT_MCP_PORT}/mcp`;

/**
 * Gets the MCP server URL based on the current page origin.
 * In dev mode (Vite on port 5173), falls back to localhost:3350.
 * @returns {string} The MCP server URL
 */
export function getMcpUrl(): string {
  // Test environment or SSR: use default
  if (typeof window === "undefined") {
    return DEFAULT_MCP_URL;
  }

  const { hostname, port, protocol } = window.location;

  // Vite dev server (port 5173 is outside Producer Pal's 3300-3555 range)
  if (port === VITE_DEV_PORT) {
    return DEFAULT_MCP_URL;
  }

  // Production: use same origin as the page (UI served from MCP server)
  return `${protocol}//${hostname}${port ? `:${port}` : ""}/mcp`;
}
