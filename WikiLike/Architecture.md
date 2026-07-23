# Project Architecture - Local AI Computer Agent

This document explains the high-level design, file structure, module layout, and communication protocols of the Local AI Computer-Use Agent.

---

## 1. High-Level Design

The system runs locally on the user's host machine. It connects to **LM Studio** (or similar local LLM APIs matching the OpenAI chat completions schema) for autonomous planning and reasoning, and to the local operating system to execute shell commands, manage files, read browser content, and interact with the desktop.

There are three primary interfaces of control:
1. **Web Dashboard**: A real-time monitoring and administrative portal connected via WebSockets.
2. **Discord Bot**: A remote interface allowing chat triggers, music playback, and manual action approvals.
3. **Manual AI Bridge**: A fallback visual pipeline for copy-pasting prompts to external web LLMs (e.g. Gemini, Claude, ChatGPT) when the local LLM is offline or unreachable.

```
                  ┌────────────────────────┐
                  │   User Interactions    │
                  └───────────┬────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────┐  ┌───────────────────┐
│  Web Dashboard   │  │ Discord Bot  │  │  Manual AI Bridge │
└────────┬─────────┘  └──────┬───────┘  └─────────┬─────────┘
         │ (WS Auth)         │                    │
         └───────────┐        │                    │ (Pasted Output)
                     ▼        ▼                    ▼
                ┌──────────────────────────────────────┐
                │   Express Backend & WebSocket        │
                │        (server.js / PORT 3000)       │
                └──────────────────┬───────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│  src/state   │             │ src/security │             │  src/memory  │
└──────────────┘             └──────────────┘             └──────────────┘
      ▲                            ▲                            ▲
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │  src/agent   │ ◄─── (Vector search embeddings)
                            └──────┬───────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │  src/tools   │ ◄─── (Puppeteer browser, Shell runner)
                            └──────┬───────┘
                                   │
                                   ▼
                           [Operating System]
```

---

## 2. Directory Layout & Module Breakdown

The codebase is strictly modularized to separate backend state, security validation, tool execution, AI loops, and discord hooks.

### 📁 `src/` (Core Source Files)

*   **`src/state.js`**:
    *   **Purpose**: Manages the runtime agent state (`agentState`) and broadcast systems.
    *   **State parameters**: Track task status (`idle`, `thinking`, `pending_approval`, `manual_bridge`, `completed`, `failed`), active console log buffer, target current working directory (`cwd`), and WebSocket client connections.
    *   **Actions**: Implements terminal logs buffering, dynamic WebSocket broadcasts, and debounce batches (150ms delay) to prevent network congestion from intensive terminal outputs.

*   **`src/security.js`**:
    *   **Purpose**: Implements multi-tier safety checks before any action is executed.
    *   **Safety features**:
        *   Loads and watches `config/security_rules.json`.
        *   **Banned Words Filter**: Performs fast-path substring scans and case-insensitive matching. Calculates Levenshtein distance metrics dynamically but ignores words with length differences $> 2$ to keep the Node.js event loop free.
        *   **Banned Websites Filter**: Restricts Web Scraper targets.
        *   **Directory Access Checks**: Ensures file creation, deletions, or edits remain inside permitted directory bounds (`allowedBaseFolders`).

*   **`src/memory.js`**:
    *   **Purpose**: Implements context accumulation, Git history commits, and workspace rule bindings.
    *   **Core functions**:
        *   Loads long-term task histories (`config/memory.json`).
        *   Pre-filters task rules (`.agent-rules.md` / `.agent-context.md`) and passes relevant context blocks.
        *   Updates the `agent_readme.md` file dynamically using keyword frequencies (TF-IDF light) to prevent token pollution.
        *   Automates Git staging and commits on task conclusions (`runGitCommit`).

*   **`src/rag/vectorSearch.js`**:
    *   **Purpose**: Vector similarity math for memory retrieval.
    *   **Math operations**: Uses cosine similarity calculations between search queries and vectorized historical tasks. Leverages local embedding models hosted on LM Studio.

*   **`src/agent.js`**:
    *   **Purpose**: Orchestrates the main autonomous loop (`runAgentLoop`).
    *   **Key features**:
        *   Communicates with the LLM endpoint `/chat/completions`.
        *   Provides robust sanitization for malformed model JSON responses.
        *   Manages the **Manual AI Bridge** loop when LM Studio is unreachable.
        *   Implements an infinite loop detector that aborts tasks if the model generates 3 consecutive identical failed tool calls.

*   **`src/tools.js`**:
    *   **Purpose**: Host implementation for all computer manipulation tools.
    *   **Engine specifics**:
        *   Runs shell commands asynchronously (`spawn`).
        *   Provides visual feedback through Puppeteer screenshots.
        *   Uses a recycling Puppeteer browser singleton instance to control RAM usage (restarts browser after 20 uses).
        *   Validates image tags, scrapes sites in multiple modes (`text`, `media`, `all`), and provides output filters (`filter_output`).

*   **`src/discord/` (Discord Bot Stack)**:
    *   **`client.js`**: Initializes the bot gateway client and registers listeners.
    *   **`musicPlayer.js`**: Handles voice channel bindings, yt-dlp triggers, playback, and Opus stream pipes.
    *   **`commands.js`**: Processes commands (`!play`, `!skip`, `!library`, etc.).
    *   **`agentBridge.js`**: Connects Discord buttons to backend approvals and broadcasts agent activity cards to Discord channels.
    *   **`utils.js`**: Verifies role credentials and maps system scopes.

---

## 3. Configuration Layout (`config/`)

All files in `config/` are persistent JSON schemas loaded at boot time and edited on-the-fly via the Web Dashboard Admin Panel:
- **`config/config.json`**: Holds model URLs, active model identifier, temperature, loop steps count, and auto-approve permission maps for tools.
- **`config/security_rules.json`**: Lists forbidden strings, banned domain blocks, and base workspace directories.
- **`config/permissions.json`**: Keeps Discord role bindings for bot commands.
- **`config/kurucu.json`**: Contains the founder's Discord ID (watched dynamically for instant updates).
- **`config/memory.json`**: Stores the 20 most recent successful tasks, complete with semantic embeddings.

---

## 4. Communication & Synchronization Protocols

### HTTP Endpoints
The Express server primarily serves static assets from `/public`. It also handles local API routing if required, but leaves core messaging to the WebSocket.

### WebSockets Gateway
A single WebSocket server binds to Express and requires a `FOUNDER_KEY` handshake immediately upon connection (with a 5-second auth timeout):
```
Client                      Server
  │                           │
  ├─────── ws connect ───────►│
  │                           ├─ (Starts 5s Auth Timeout)
  ├─────── type: 'auth' ─────►│
  │   key: "well well well..."├─ (Validates key)
  │◄────── type: 'auth_success'┤
  │                           │
  │◄────── initial states ────┤ (Sends state, settings, metrics)
  │                           │
```

All dashboard modifications (such as updating rules, editing `.env`, clearing memories, or manually selecting guide documents) flow through custom WS cases as JSON frames.
