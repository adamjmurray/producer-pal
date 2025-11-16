import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  description:
    "AI music production assistant for Ableton Live. Works with Claude, Gemini, GPT, and local models.",

  // GitHub Pages base URL
  base: "/producer-pal/",

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/getting-started" },
      {
        text: "GitHub",
        link: "https://github.com/adamjmurray/producer-pal",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          // Add more guide items here as you create them
        ],
      },
      // Add more sidebar sections here
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/adamjmurray/producer-pal" },
    ],

    search: {
      provider: "local",
    },
  },
});
