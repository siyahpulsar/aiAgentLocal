# Master Research & Architecture Notes — Local AI Agent (Pulsaristic)

> **Last Updated:** 2026-07-22 18:13:13 | **Status:** Synchronized after v2.5 Deep Analysis & Bug Fixes

## 1. System Overview & Tech Stack
- **Environment:** Node.js (v18+), Express, WebSocket (`ws`), Discord.js v14, Puppeteer, LM Studio (OpenAI-compatible REST API).
- **Core Goal:** 100% Local, zero-subscription computer-use AI Agent capable of file manipulation, terminal command execution, web browsing, vision analysis, Discord interaction, and multi-agent swarm planning.

## 2. Directory & Module Breakdown
- `server.js`: Express server, WebSocket initialization, system metrics (RAM/CPU) broadcasting, sandbox container scanning.
- `src/agent.js`: Main loop runner (`runAgentLoop`), Swarm Mode manager (Planner, Developer, QA Tester), prompt assembly, action loop detection, and human approval flow (`pending_approval`).
- `src/llm/llmClient.js`: LM Studio HTTP fetcher with exponential backoff retries, 5-tiered parser (JSON codeblocks, raw JSON, XML, Qwen `[TOOL_CALLS]`, Heuristic Regex), `getDynamicSystemPrompt`, and Manual AI Bridge fallback.
- `src/state.js`: Central reactive state (`agentState`), WebSocket delta diff patch broadcaster (`state_patch`), 5-second TTL guide cache.
- `src/security.js`: Path Traversal guard (`fs.realpathSync`), Levenshtein distance banned word detection, banned commands regex scanner, action risk scoring.
- `src/memory.js`: RAG vector search (LM Studio embeddings) + TF-IDF keyword fallback, automatic `agent_readme.md` directory structure updater, Git auto-commit helper.
- `src/tools/`: Modular tool execution engine (`executeTool`), system (`captureScreenshot`, `runShellCommand`, `openApplication`), web (`searchWeb`, `viewWebsite`), filesystem (`readLocalFile`, `writeLocalFile`, `listLocalDirectory`), image (`downloadImage`, `urlImageReader`), filters (`filterOutput`, `lineChecker`).
- `src/discord/`: Discord bot client, authorization validator, music player (`ytdlp`), agent bridge.
- `byAI/`: AI Agent logs (`aiDevLog-*.md`), comparison reports (`agent_karsilastirmalari.md`), research notes, suggestions, and security leak tracking.

## 3. Key Architectural Innovations
1. **Manual AI Bridge:** If local LLM fails or is offline, system automatically switches to manual bridge mode, presenting a formatted prompt for user input in Web UI.
2. **Delta Patch WebSocket Broadcasting:** Sends incremental patches instead of full state objects, preserving network bandwidth and UI smoothness.
3. **Multi-Format Tool Parser:** Parses tool calls across 5 different LLM output structures, ensuring compatibility with 3B/7B low-parameter models.
4. **Strict Security Sandbox:** Resolves physical canonical paths via `realpathSync` to prevent symlink bypasses and directory traversal attacks out of workspace root or `.container`.
5. **Swarm Multi-Agent Mode:** Dynamic role switching (Planner -> Developer -> QA Tester) based on execution step and failure feedback.
