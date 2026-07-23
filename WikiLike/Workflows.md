# Operational Workflows - Local AI Computer Agent

This document explains the workflows and data mapping pathways followed by the Agent from the moment a task starts until the final git commit and cleanup processes are completed.

---

## 1. Task Initiation Workflow

When a task is submitted via the Web Dashboard or Discord:

1. **Gateway Trigger**:
   - Web Dashboard sends a WS frame `{ type: 'user_message', content: '...' }`.
   - Discord Bot catches a prefix trigger (e.g. `!ask <task_content>`) in `messageCreate` and calls `startDiscordAgentTask(taskContent)`.
2. **Safety Check**:
   - Submits the task query to `checkBannedWords()`. If it contains banned words, it aborts immediately, notifies the user, and sets status to `failed`.
3. **Context Injection**:
   - Clears active chat history.
   - Triggers `getMemoryPrompt()` which queries `config/memory.json` via RAG (embeddings similarity) or keyword fallback, returning the top 3 contextual tasks.
   - Triggers `getWorkspaceRulesPrompt()` which pulls workspace guidelines from `.agent-rules.md` (or `.agent-context.md`) if present.
   - Merges these blocks with the default system prompt, injecting the chosen guide (e.g. `web_search_guide.md`) as the active prompt template.
4. **Activation**:
   - Status updates to `thinking`.
   - Broadcasts the updated state to WebSocket clients and updates the Discord Bot status to "Working on task...".
   - Starts the execution thread (`runAgentLoop()`).

---

## 2. User Approval Workflow

For commands marked as high-risk or requiring confirmation:

1. **Risk Scoring**:
   - `assessActionRisk()` evaluates the command name and arguments.
   - Checks `config/config.json` rules: if `autoApprove` is `false` for the tool, approval is required.
2. **Pause & Notify**:
   - The loop pauses execution by creating a pending Promise:
     ```javascript
     return new Promise((resolve) => {
         activeActionResolver = resolve;
     });
     ```
   - Sets status to `pending_approval` and stores details in `agentState.pendingAction`.
   - Broadcasts the update to the Web Dashboard.
   - **Discord Notification**: Dispatches an approval card containing action details and two buttons (Approve/Reject) using `sendApprovalRequest()`.
3. **Resolution**:
   - **Scenario A (Web approval)**: User clicks Approve/Reject on the Dashboard. Dashboard sends `{ type: 'approve_action', action: '...' }` or `{ type: 'reject_action', feedback: '...' }` via WS.
   - **Scenario B (Discord approval)**: User clicks the green/red Discord buttons. The bot interaction listener processes the click and calls `resolvePendingAction({ approved: true/false })`.
4. **Resume**:
   - The pending Promise resolves with the user's action and feedback parameters.
   - The loop resumes and continues execution.

---

## 3. System Metrics Broadcast Workflow

To monitor the performance of the local host:

1. **Cron Interval**:
   - A `setInterval` loop in [server.js](file:///d:/ai/aiAgentLocal/server.js) runs every **3 seconds**.
2. **Metrics Fetching**:
   - Pulls RAM states using standard `os` libraries:
     - Total RAM, free RAM, and calculated used RAM percentages.
   - Calculates CPU usage percentages:
     - Compares CPU core idle times against total active clock ticks:
       $$\text{CPU Usage } \% = 100 \times \left(1 - \frac{\text{Idle Tick Difference}}{\text{Total Tick Difference}}\right)$$
3. **Broadcast**:
   - Dispatches a payload of type `system_metrics` containing `cpu` and `ram` percentages, along with raw megabyte volumes, to all active WebSocket dashboards.

---

## 4. Task Finalization & Cleanup Workflow

Once the LLM executes the `task_complete` tool:

1. **State Update**:
   - Status updates to `completed`.
2. **Memory Accumulation**:
   - Calls `appendToMemory(task, summary)` to update `config/memory.json`.
   - Vectorizes the task and summary block and appends the embedding. Removes the oldest record if memory count exceeds 20 items.
3. **README Documentation**:
   - Invokes `updateWorkspaceReadme()`.
   - Scans directories recursively (up to 2 levels deep, excluding `node_modules`, `.git`, `.gemini`, and `screenshots`) to construct a file map.
   - Appends the latest accomplishments with a date stamp to the end of `agent_readme.md`.
4. **Git Auto-Commit**:
   - Verifies if a `.git` repository exists in the workspace.
   - Executes shell commands: `git add . && git commit -m "feat(agent): accomplished task - <task_summary>"` using child processes.
   - Streams terminal confirmation logs.
5. **Discord cleanup**:
   - Triggers `cleanupTaskMessages()`.
   - **5 seconds** after sending final task summaries, deletes all temporary discord bot interaction cards and approval prompts to clean up the text channels.
