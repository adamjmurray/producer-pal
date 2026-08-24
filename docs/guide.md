---
title: Getting Started
description:
  Get started with Producer Pal — the Ableton MCP server for AI-powered music
  production in Ableton Live. Quick guide to install and connect your AI.
---

# Getting Started

Welcome to Producer Pal™! This guide will help you get started controlling
Ableton Live with words. Producer Pal is an Ableton MCP server, a
[REST API](/guide/rest-api), and a portable [Agent Skill](/guide/skills) — three
ways into the same Max for Live device.

## Installation

For detailed installation instructions for your preferred AI platform, see the
[Installation Guide](/installation).

Quick options:

- **[Built-in Chat UI](/installation/chat-ui)** - Works with Gemini, Ollama, and
  more
- **[Claude Desktop](/installation/claude-desktop)** - Recommended for Anthropic
  users
- **[Command Line Tools](/installation#command-line)** - Gemini CLI, Codex CLI,
  Claude Code, and other MCP-compatible coding agents
- **[Local Models](/installation/choose-local)** - Run completely offline with
  Ollama, LM Studio Bionic, and other MCP-compatible platforms
- **[Agent Skill](/guide/skills)** - Drop a folder into Claude Code, Codex CLI,
  or Gemini CLI — no MCP config
- **[REST API](/guide/rest-api)** - Script Live over plain HTTP, no AI required

Already have an MCP-compatible client? Connect with `npx producer-pal`
([setup](/installation/other-mcp), [CLI reference](/guide/npx-cli))

## Quick Start

After installation:

1. Open Ableton Live with your project
2. Load the Producer Pal Max for Live device onto a MIDI track
   ([download latest version](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd))
3. Connect to Producer Pal in your AI interface
4. Say "connect to ableton"
5. Try a simple command:
   - "What's in my project?"
   - "Create a new MIDI track called Bass"
   - "Change the tempo to 108 BPM"

Using the [Agent Skill](/guide/skills) instead? Steps 3 and 4 are handled by its
bootstrap. Using the [REST API](/guide/rest-api) directly? Nothing connects for
you — call `ppal-connect` first when a model is in the loop, since that's what
returns the skills and [context](/guide/context). A plain script can call the
other tools straight away.

## User Interface

- [Device Interface](/guide/device) - The Max for Live device tabs and settings
- [Chat UI](/guide/chat-ui) - The built-in browser-based chat interface
- [Context & Memory](/guide/context) - Teach AI about your project and your
  preferences, and see what it remembers about you

## Next Steps

- Check out the [usage examples](/features/examples) for detailed examples and
  tips
- Explore the [feature list](/features) to see everything Producer Pal can do
- Cut what each conversation costs with
  [Optimizing Cost & Context](/guide/optimizing)
- Watch the [demo videos](/#demos) and
  [video tutorials](https://www.youtube.com/playlist?list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
- See what's coming in the [roadmap](/roadmap)

## Need Help?

- Visit the [Support page](/support) for help, bug reports, and more
