import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  description:
    "AI music production assistant for Ableton Live. Works with Claude, Gemini, GPT, and local models.",

  // GitHub Pages base URL
  base: "/",

  sitemap: { hostname: "https://producer-pal.org" },

  head: [["link", { rel: "icon", href: "/producer-pal-logo.svg" }]],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Installation", link: "/installation/" },
      { text: "Guide", link: "/guide/" },
      { text: "Features", link: "/features/" },
      { text: "Roadmap", link: "/roadmap/" },
      {
        text: "GitHub",
        link: "https://github.com/adamjmurray/producer-pal",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/" },
          { text: "Usage Examples", link: "/guide/usage/" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Features", link: "/features/" },
          { text: "Roadmap", link: "/roadmap/" },
        ],
      },
      {
        text: "Installation",
        items: [
          { text: "Overview", link: "/installation/" },
          { text: "Upgrading", link: "/installation/upgrading" },
        ],
      },
      {
        text: "Recommended",
        items: [
          {
            text: "Chat UI (Gemini, Ollama, etc)",
            link: "/installation/chat-ui",
          },
          { text: "Claude Desktop", link: "/installation/claude-desktop" },
          { text: "npx producer-pal", link: "/installation/other-mcp" },
        ],
      },
      {
        text: "Command Line",
        items: [
          { text: "Gemini CLI", link: "/installation/gemini-cli" },
          { text: "Codex CLI", link: "/installation/codex-cli" },
          { text: "Claude Code", link: "/installation/claude-code" },
        ],
      },
      {
        text: "Web Apps",
        items: [
          { text: "claude.ai", link: "/installation/claude-web" },
          { text: "ChatGPT", link: "/installation/chatgpt-web" },
        ],
      },
      {
        text: "Local & Advanced",
        items: [
          { text: "Ollama", link: "/installation/chat-ui#ollama" },
          { text: "LM Studio", link: "/installation/lm-studio" },
          { text: "Other MCP LLMs", link: "/installation/other-mcp" },
          { text: "Web Tunnels", link: "/installation/web-tunnels" },
          { text: "Troubleshooting", link: "/installation/troubleshooting" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/adamjmurray/producer-pal" },
    ],

    search: {
      provider: "local",
    },
  },
});
