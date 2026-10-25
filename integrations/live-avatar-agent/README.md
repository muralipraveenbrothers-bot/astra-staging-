# Gemini Live Avatar Agent Demo

This repository contains a complete, self-contained template for running a Gemini Live Agent with an **Avatar Configuration Plugin** and a beautiful, glassmorphic **Web Client** (`avatar_client.html`). It is built using Google's **Agent Development Kit (ADK)** and the Gemini Live API.

This demo enables real-time bidirectional audio and video streaming of a Gemini digital avatar (e.g., "Kai").

## 📁 Repository Structure

```
live-avatar-agent-demo/
├── README.md                  # This documentation file
├── .gitignore                 # Standard Python gitignore rules
├── requirements.txt           # Python dependency specifications
└── live_avatar_agent/         # The agent application package
    ├── __init__.py
    ├── agent.py               # The main ADK agent definitions
    └── avatar_client.html     # Real-time WebSocket/MediaSource web client
```

---

## 🛠️ Prerequisites

Before getting started, make sure you have the following installed and configured:

1. **Python 3.11+**
2. **Google Cloud SDK (`gcloud`)**
3. **Google Cloud Project**: You need an active Google Cloud Project with the **Vertex AI API** enabled.
4. **Google Cloud Credentials**: Authenticate your terminal using:
   ```bash
   gcloud auth application-default login
   ```

---

## 🚀 Getting Started

Follow these steps to set up and run the demo locally:

### 1. Set Up your Environment

Clone or download this folder, navigate into it, and create a Python virtual environment:

```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

### 2. Run the ADK Web Server

Launch the ADK web server pointing to the current directory:

```bash
# Set your active Google Cloud Project ID
export GCP_PROJECT="your-google-cloud-project-id"

# (Optional) Set your Vertex AI Search Engine/App ID if you want to test website search
export VERTEXAI_ENGINE_ID="your-search-engine-id"

# Run the ADK server
adk web .
```

You should see output similar to this:
```
+-----------------------------------------------------------------------------+
| ADK Web Server started                                                      |
|                                                                             |
| For local testing, access at http://127.0.0.1:8000.                         |
+-----------------------------------------------------------------------------+
```

### 3. Open the Avatar Web Client

Since the client communicates directly with `localhost:8000` via WebSockets, you can open the HTML client directly in any browser:

- Double-click the file [avatar_client.html](./live_avatar_agent/avatar_client.html) or run:
  ```bash
  # On macOS:
  open live_avatar_agent/avatar_client.html
  # On Linux:
  xdg-open live_avatar_agent/avatar_client.html
  ```

Once opened, you will see the glassmorphic **Gemini Avatar Client** interface.
- It will automatically connect to the ADK backend server.
- Click the **Microphone** icon at the bottom of the page to start speaking, or type a text message in the chat input.
- The avatar will respond in real-time with bidirectional video and audio streaming!

---

## ⚙️ Configuration & Customization

### Vertex AI Search
The agent is configured to use the `DiscoveryEngineSearchTool` (Vertex AI Search) for answering internal queries.
- If you have an active website data store, configure `VERTEXAI_ENGINE_ID` inside [agent.py](./live_avatar_agent/agent.py) or set it via environment variables before launching.
- If you don't need search, you can remove the `DiscoveryEngineSearchTool` import and tool from the `tools=[...]` list inside [agent.py](./live_avatar_agent/agent.py).

### Changing Avatars
The agent uses the `AvatarConfigPlugin` to request the avatar modality.
- Currently, options include `'Kai'` and `'Cora'`.
- You can change `avatar_name = 'Kai'` in the `before_run_callback` method of the `AvatarConfigPlugin` class in [agent.py](./live_avatar_agent/agent.py).

---

## 📤 Publishing to GitHub

To share this demo with other engineers or customers:

1. **Initialize the local Git repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Live Avatar Agent Demo"
   ```

2. **Create a new repository on GitHub** (e.g., named `live-avatar-agent-demo`).

3. **Push the local repository to GitHub:**
   ```bash
   git remote add origin https://github.com/<your-github-username>/live-avatar-agent-demo.git
   git branch -M main
   git push -u origin main
   ```
