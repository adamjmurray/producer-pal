# Chat UI

The built-in Chat UI provides a browser-based interface for chatting with AI
directly from within Producer Pal.

![Chat UI](/producer-pal-chat.png)

## Getting Started

1. Enable Chat UI in the [Device Interface](/guide/device) Main tab
2. Click "Open Chat UI" or navigate to `http://localhost:3350`
3. Click "Quick Connect" to connect to Ableton Live

## Header Bar

- **Status** - Shows "Ready" (green) when connected to Ableton
- **Provider & Model** - Current AI provider and model
- **Tools** - Number of enabled tools (e.g., "22/22 tools")
- **Settings** - Open settings dialog
- **Restart** - Start a new conversation (appears during chat)

## Conversations

![Conversation](/producer-pal-chat-conversation.png)

During conversations, you'll see:

- **Your messages** - What you typed
- **AI thinking** - Expandable sections showing AI's reasoning process
- **Tool usage** - Collapsed indicators when AI uses Producer Pal tools
- **AI responses** - Results and suggestions from the AI

### Expandable Thoughts

![Expandable thoughts](/producer-pal-chat-expandable-thoughts.png)

Click "Thought about:" sections to see the AI's reasoning process.

## Message Input

- **Thinking indicator** - Shows current thinking mode and randomness
- **Text area** - Type your message (Shift+Enter for new line)
- **Send** - Send your message

## Settings

### Connection

![Connection settings](/producer-pal-chat-settings-connection.png)

Configure your AI provider:

- **Provider** - Choose from Gemini, OpenAI, Ollama (local), OpenRouter, or
  Other
- **API Key** - Your API key (for cloud providers)
- **Model** - Select a model or enter a custom model name

#### Ollama (Local)

![Ollama settings](/producer-pal-chat-settings-connection-ollama.png)

For local models with Ollama:

- **Port** - Ollama port (default: 11434)
- **Model** - Select from installed models

#### OpenRouter

![OpenRouter settings](/producer-pal-chat-settings-connection-open-router-other-model.png)

Access many models through OpenRouter:

- Select "Other..." to enter any model name (e.g., `deepseek/deepseek-v3.2`)

### Behavior

![Behavior settings](/producer-pal-chat-settings-behavior.png)

- **Thinking** - Control AI thinking depth (None, Low, Medium, High, Auto)
- **Show thinking process** - Display AI reasoning in chat
- **Randomness** - Creativity level (0% = deterministic, 100% = creative)
- **Reset to defaults** - Restore default behavior settings

### Tools

![Tools settings](/producer-pal-chat-settings-tools.png)

Enable or disable individual Producer Pal tools. Useful for:

- Limiting AI capabilities for safety
- Focusing on specific tasks
- Troubleshooting

### Appearance

![Appearance settings](/producer-pal-chat-settings-appearance.png)

- **Theme** - System, Light, or Dark mode
