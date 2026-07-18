import { defineConfig } from "vitepress";
import { VERSION } from "../../src/shared/config.ts";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  titleTemplate: ":title | Producer Pal — Ableton MCP for AI music production",
  description:
    "The most actively developed Ableton MCP server — AI for Ableton Live, updated for the latest Live features. Works with Claude, Gemini, ChatGPT, and local models.",

  // GitHub Pages base URL
  base: "/",

  sitemap: {
    hostname: "https://producer-pal.org",
    // Keep the /guide/examples redirect stub (moved to /features/examples) out
    // of the sitemap so crawlers index the destination, not the redirect.
    transformItems: (items) =>
      items.filter((item) => !item.url.startsWith("guide/examples")),
  },

  cleanUrls: true,

  srcExclude: ["_generated/**", "_partials/**", "public/markdown/**"],

  transformPageData(pageData) {
    const path = pageData.relativePath
      .replace(/\.md$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");
    pageData.frontmatter.head ??= [];
    // Respect a page's own canonical (e.g. the /guide/examples redirect stub
    // points at /features/examples); otherwise default to a self-canonical.
    const hasCanonical = pageData.frontmatter.head.some(
      ([tag, attrs]) => tag === "link" && attrs?.rel === "canonical",
    );
    if (!hasCanonical) {
      pageData.frontmatter.head.push([
        "link",
        { rel: "canonical", href: `https://producer-pal.org/${path}` },
      ]);
    }
    pageData.frontmatter.version = VERSION;
  },

  head: [
    ["link", { rel: "icon", href: "/producer-pal-logo.svg" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "Ableton MCP, AI for Ableton, Ableton Live MCP, Ableton AI, AI music production, Max for Live MCP server, Claude Ableton, Gemini Ableton, ChatGPT Ableton, Ableton REST API, Ableton Live REST API, Ableton HTTP API, Ableton Live API, Agent Skills, Claude Skills, Codex Skills, Gemini Skills, Coding Agent Skills, Ableton Live Agent Skill, SKILL.md",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Producer Pal" }],
    [
      "meta",
      {
        property: "og:title",
        content: "Producer Pal — Ableton MCP for AI music production",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "The most actively developed Ableton MCP server — AI for Ableton Live, updated for the latest Live features. Works with Claude, Gemini, ChatGPT, and local models.",
      },
    ],
    ["meta", { property: "og:url", content: "https://producer-pal.org" }],
    [
      "meta",
      {
        property: "og:image",
        content: "https://producer-pal.org/producer-pal-logo.png",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      {
        name: "twitter:title",
        content: "Producer Pal — Ableton MCP for AI music production",
      },
    ],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "The most actively developed Ableton MCP server — AI for Ableton Live, updated for the latest Live features. Works with Claude, Gemini, ChatGPT, and local models.",
      },
    ],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://producer-pal.org/producer-pal-logo.png",
      },
    ],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Installation", link: "/installation" },
      { text: "Guide", link: "/guide" },
      { text: "Features", link: "/features" },
      { text: "How It Works", link: "/how-it-works" },
      { text: "Support", link: "/support" },
      {
        text: "GitHub",
        link: "https://github.com/adamjmurray/producer-pal",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        link: "/guide",
        items: [
          { text: "Device Interface", link: "/guide/device" },
          { text: "Chat UI", link: "/guide/chat-ui" },
          { text: "Context & Memory", link: "/guide/context" },
          { text: "Customizing Skills", link: "/guide/customizing-skills" },
          { text: "REST API", link: "/guide/rest-api" },
          { text: "Agent Skills", link: "/guide/skills" },
        ],
      },
      {
        text: "Features",
        link: "/features",
        items: [
          { text: "Usage Examples", link: "/features/examples" },
          { text: "MIDI Notation", link: "/features/midi-notation" },
          { text: "Extending", link: "/extending" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "How It Works",
        link: "/how-it-works",
        items: [
          {
            text: "Running Inside Ableton Live",
            link: "/how-it-works/running-inside-live",
          },
          {
            text: "The Bridge: JSON Over Patch Cables",
            link: "/how-it-works/the-bridge",
          },
          {
            text: "More Than a Live API Wrapper",
            link: "/how-it-works/more-than-a-wrapper",
          },
          {
            text: "Why Not an Ableton Extension?",
            link: "/how-it-works/why-not-an-extension",
          },
        ],
      },
      {
        text: "Support",
        link: "/support",
        items: [
          { text: "Troubleshooting", link: "/support/troubleshooting" },
          { text: "Known Issues", link: "/support/known-issues" },
        ],
      },
      {
        text: "Installation",
        link: "/installation",
        items: [
          { text: "Upgrading", link: "/installation/upgrading" },
          {
            text: "Built-in Chat UI",
            link: "/installation/chat-ui",
            items: [
              { text: "Gemini", link: "/installation/gemini" },
              { text: "OpenAI", link: "/installation/openai" },
              { text: "Ollama", link: "/installation/ollama" },
              {
                text: "Other Providers",
                link: "/installation/chat-ui-other-providers",
              },
            ],
          },
          {
            text: "Desktop Apps",
            link: "/installation/desktop-apps",
            items: [
              {
                text: "Claude Desktop",
                link: "/installation/claude-desktop",
              },
              { text: "Codex App", link: "/installation/codex-app" },
              { text: "LM Studio", link: "/installation/lm-studio" },
            ],
          },
          {
            text: "Command Line",
            link: "/installation/cli",
            items: [
              { text: "Gemini CLI", link: "/installation/gemini-cli" },
              { text: "Codex CLI", link: "/installation/codex-cli" },
              { text: "Claude Code", link: "/installation/claude-code" },
              { text: "Mistral Vibe", link: "/installation/mistral-vibe" },
            ],
          },
          {
            text: "Web Apps",
            link: "/installation/web-apps",
            items: [
              { text: "claude.ai", link: "/installation/claude-web" },
              { text: "ChatGPT", link: "/installation/chatgpt-web" },
              { text: "Le Chat", link: "/installation/mistral-le-chat" },
            ],
          },
          {
            text: "Choose by Provider",
            link: "/installation/choose-by-provider",
            items: [
              {
                text: "Claude / Anthropic",
                link: "/installation/choose-claude",
              },
              {
                text: "ChatGPT / OpenAI",
                link: "/installation/choose-openai",
              },
              {
                text: "Gemini / Google",
                link: "/installation/choose-gemini",
              },
              {
                text: "Mistral / Mistral AI",
                link: "/installation/choose-mistral",
              },
              { text: "Local / Offline", link: "/installation/choose-local" },
              {
                text: "Multiple Providers",
                link: "/installation/choose-multi",
              },
            ],
          },
          {
            text: "Advanced",
            link: "/installation/advanced",
            items: [
              { text: "Other MCP LLMs", link: "/installation/other-mcp" },
              { text: "Web Tunnels", link: "/installation/web-tunnels" },
            ],
          },
        ],
      },
    ],

    socialLinks: [
      { icon: "discord", link: "https://discord.gg/rmU3DSzgwH" },
      { icon: "youtube", link: "https://www.youtube.com/@adammurray-link" },
      { icon: "github", link: "https://github.com/adamjmurray/producer-pal" },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the GPL-3.0 License.",
      copyright: `Copyright © ${new Date().getFullYear()} <a href="https://adammurray.link">Adam Murray</a>`,
    },
  },
});
