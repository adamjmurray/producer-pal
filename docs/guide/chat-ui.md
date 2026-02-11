# Chat UI

The built-in Chat UI provides a browser-based interface for chatting with AI
directly from within Producer Pal.

![Chat UI](/producer-pal-chat.png)

## Getting Started

1. Enable Chat UI in the [Device Interface](/guide/device) Main tab
2. Click "Open Chat UI" or navigate to `http://localhost:3350/chat`
3. If this is your first time using the chat UI, you need to configure which AI
   to use. See [the Settings documentation](#settings) below
4. Click "Quick Connect" to connect to Ableton Live (this is a shortcut sending
   "Connect to Ableton" via the message input)

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
- **AI responses** - Results and suggestions from the AI
- **Tool usage** - Collapsed indicators when AI uses Producer Pal tools
- **AI thinking** - Expandable sections showing AI's reasoning process (only
  appears for some AI models)

### Expandable Thoughts

Some AI models output "thoughts". When they do, you can click "Thought about:"
sections to see the AI's reasoning process:

![Expandable thoughts](/producer-pal-chat-expandable-thoughts.png)

## Message Input

- **Thinking indicator** - Shows current thinking mode and randomness (this can
  be changed in settings)
- **Text area** - Type your message (Shift+Enter for new line)
- **Send** - Send your message

## Settings

Settings are stored on your computer in your browser's local storage so you
don't have to redo the setup every time you use Producer Pal. If entering an AI
cloud provider's API key concerns you, use a private browser or clear your
settings after use.

For more information about how to configure specific AI providers, see the
[installation guide for AI with the chat UI](/installation/chat-ui).

### Connection

The Connection tab is where you choose and configure your AI provider and model:

<img src="/producer-pal-chat-settings-connection.png" alt="Connection settings" width="500"/>

Configure your AI provider:

- **Provider** - Choose from Gemini, OpenAI, Mistral, OpenRouter, Ollama
  (local), LM Studio (local), or Other
- **API Key** - Your API key (for cloud providers)
- **Model** - Select a model or enter a custom model name

#### Local AI settings (Ollama, LM Studio)

<img src="/producer-pal-chat-settings-connection-ollama.png" alt="Ollama settings" width="500"/>

Local models, such as those you can run with Ollama, do not require any API
keys. Instead, they have a configurable URL.

- **URL** - Server address (default: `http://localhost:11434` for Ollama,
  `http://localhost:1234` for LM Studio)
- **Model** - Select from installed models

In most cases, you should use the default URL. This is an advanced configuration
option.

You may need to change the URL if:

- You've modified the port in your Ollama or LM Studio installation
- You're running Ollama or LM Studio on a different computer on your local
  network (or anywhere on the Internet). This allows another computer to handle
  the resource-intensive language model processing while your main computer
  focuses on running Ableton Live. Replace `localhost` with the other computer's
  network address (e.g., `http://192.168.1.100:11434`)

#### Other models

Each AI provider supports multiple models and Producer Pal provides some
recommended options in the model dropdown box. To use a different model, select
"Other...". An additional text input appears where you can enter an arbitrary
model id. Consult your AI provider for the models that are currently available.

<img src="/producer-pal-chat-settings-connection-open-router-other-model.png" alt="OpenRouter settings" width="500"/>

#### Custom providers

Producer Pal can work with any AI provider that has an API compatible with
OpenAI's chat API. Most providers support this. When setting up a custom
provider, you also need to enter the **URL** for the provider's API. Consult the
provider's documentation to determine the correct setting.

For example, one could use [groq.com](https://groq.com/) as follows:

<img src="/producer-pal-chat-settings-custom-provider.png" alt="Custom provider" width="500"/>

### Behavior

The behavior tab lets you control aspects of how the AI behaves:

<img src="/producer-pal-chat-settings-behavior.png" alt="Behavior settings" width="500"/>

- **Thinking** - Control AI thinking effort. The choices and availability of
  this option depend on the provider selected in
  [the Connection tab](#connection)
- **Show thinking process** - Display AI reasoning in chat. If you don't care
  about this, you can disable it to reduce clutter.
- **Randomness** - Creativity level (0% = deterministic, 100% = creative)
- **Reset to defaults** - Restore default behavior settings

### Tools

The Tools tab controls which tools are available to the AI when using the chat
UI. This is important for reducing context size for local models (when using the
Ollama or LM Studio provider). For local models, only enable the tools you need.
For state-of-the-art cloud providers (Gemini, OpenAI, etc), you generally want
to keep everything enabled to make full use of Producer Pal's capabilities. If
you want to prevent the AI from using a specific tool, you can disable it here.

Consult [the Features page](/features) for more info on what each tool does.

<img src="/producer-pal-chat-settings-tools.png" alt="Tools settings" width="500"/>

### Appearance

The Appearance tab lets you choose between light mode or dark mode, or follow
the system settings:

<img src="/producer-pal-chat-settings-appearance.png" alt="Appearance settings" width="500"/>
