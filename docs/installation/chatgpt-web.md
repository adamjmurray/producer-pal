# ChatGPT Web App

Use Producer Pal in your web browser at [chatgpt.com](https://chatgpt.com/),
OpenAI's ChatGPT web app.

<!--@include: ../_partials/web-chat-warning.md-->

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [ChatGPT account](https://chatgpt.com) (a paid subscription may be required to
  add a custom MCP server)
- [Web tunnel](./remote-access#web-tunnels) (e.g. Cloudflare or Pinggy)

## Installation Steps

<!--@include: ../_partials/install-device.md-->

### 2. Set Up a Web Tunnel

Set up [a web tunnel](./remote-access#web-tunnels) to expose your local Producer
Pal server.

For example:

```bash
cloudflared tunnel --url http://localhost:3350
```

will give you a public URL such as `https://abc-xyz.trycloudflare.com`:

![Cloudflare web tunnel](/img/cloudflare-tunnel.png)

### 3. Add a Custom MCP Server

Go to [ChatGPT → Plugins](https://chatgpt.com/plugins) and choose Add → Add
custom MCP server:

![Adding a custom MCP server in ChatGPT Plugins](/img/chatgpt-setup.png)

Fill in the form and choose "Create as a plugin":

- Name: Anything you like (e.g. `Producer Pal`)
- Server URL: Your tunnel URL + `/mcp` (e.g.,
  `https://abc-xyz.trycloudflare.com/mcp`)
- No authentication
- Check "I understand and want to continue"

![ChatGPT custom MCP server form](/img/chatgpt-setup2.png)

### 4. Connect the Plugin

Connect the new plugin when prompted:

![Connecting the Producer Pal plugin in ChatGPT](/img/chatgpt-connect.png)

### 5. Select the Plugin in a Conversation

In each conversation where you want to use Producer Pal, select the plugin from
the + menu:

![Selecting the Producer Pal plugin in ChatGPT](/img/chatgpt-enable-tools.png)

### 6. Start Using Producer Pal

Start the chat with "connect to ableton":

![ChatGPT successfully connected to Producer Pal](/img/chatgpt-success.png)

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
