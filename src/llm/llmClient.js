
const { getLmStudioEndpoint, config, agentState, broadcastTerminal } = require('../state');

async function llmFetch(messages, temperature = 0.2, bridgeContext = null, maxRetries = 3) {
  let lastError = null;
  const primaryEndpoint = getLmStudioEndpoint('/chat/completions');
  const fallbackEndpoint = primaryEndpoint.replace('://127.0.0.1', '://localhost');
  const endpointsToTry = [primaryEndpoint];
  if (primaryEndpoint !== fallbackEndpoint) {
    endpointsToTry.push(fallbackEndpoint);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const endpoint of endpointsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for local LLM inference

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature, stream: false }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`LM Studio HTTP error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data && data.error) {
          const errMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
          throw new Error(`LM Studio API Error: ${errMsg}`);
        }

        if (!data || !Array.isArray(data.choices) || data.choices.length === 0 || !data.choices[0] || !data.choices[0].message) {
          throw new Error(`LM Studio returned invalid choices response payload`);
        }

        return data.choices[0].message.content || '';
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt < maxRetries) {
      const backoffMs = attempt * 1500;
      broadcastTerminal(`> [LM STUDIO RETRY] Connection attempt ${attempt}/${maxRetries} failed (${lastError ? lastError.message : 'Error'}). Retrying in ${backoffMs / 1000}s...\n`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  // All retries failed — Fallback to Manual AI Bridge mode
  broadcastTerminal(`[LLM CONNECTION ERROR] LM Studio unreachable after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}\n`);
  broadcastTerminal(`> [MANUAL BRIDGE] Switching to Manual AI Bridge mode...\n`);

  // Build readable prompt for the user
  const contextLabel = bridgeContext ? `[${bridgeContext}] ` : '';
  const bridgeMessages = messages.map(m => {
    const roleLabel = m.role === 'system' ? '=== SYSTEM ===' :
                      m.role === 'assistant' ? '=== ASSISTANT ===' :
                      '=== USER ===';
    return `${roleLabel}\n${m.content}`;
  }).join('\n\n---\n\n');

  agentState.manualBridgePrompt = `${contextLabel}${bridgeMessages}`;
  agentState.status = 'manual_bridge';
  broadcastState();

  broadcastTerminal(`> [MANUAL BRIDGE] Waiting for user response in web UI...\n`);
  const userResponse = await new Promise((resolve) => {
    manualBridgeResolver = resolve;
  });
  manualBridgeResolver = null;
  agentState.manualBridgePrompt = null;
  agentState.status = 'thinking';
  broadcastState();
  broadcastTerminal(`> [MANUAL BRIDGE] Response received from user.\n`);
  return userResponse;
}

// Clean up a malformed JSON string (handling trailing commas, newlines in strings, etc.)
function cleanMalformedJsonString(jsonStr) {
  let cleaned = jsonStr.trim();
  
  // Remove any Javascript-style comments (// or /* */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/(?:^|[^:])\/\/.*$/gm, '');

  // Strip trailing commas before closing braces or brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Handle unescaped newlines in JSON values (very common in local models writing file contents)
  let insideString = false;
  let result = '';
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '"' && (i === 0 || cleaned[i-1] !== '\\')) {
      insideString = !insideString;
      result += char;
    } else if (insideString && char === '\n') {
      result += '\\n';
    } else if (insideString && char === '\r') {
      result += '\\r';
    } else if (insideString && char === '\t') {
      result += '\\t';
    } else {
      result += char;
    }
  }
  return result;
}

// Parse action from assistant content
function parseAssistantAction(content) {
  if (!content) return null;

  // Try extracting from markdown codeblocks first
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(content);
  if (match) {
    const rawJson = match[1].trim();
    try {
      return JSON.parse(rawJson);
    } catch (e) {
      try {
        return JSON.parse(cleanMalformedJsonString(rawJson));
      } catch (e2) {
        // Failed standard and clean, try to repair basic fields
      }
    }
  }

  // Try raw brackets
  const rawBracketsRegex = /(\{[\s\S]*"action"\s*:[\s\S]*\})/gi;
  const bracketMatch = rawBracketsRegex.exec(content);
  if (bracketMatch) {
    const rawJson = bracketMatch[1].trim();
    try {
      return JSON.parse(rawJson);
    } catch (e) {
      try {
        return JSON.parse(cleanMalformedJsonString(rawJson));
      } catch (e2) {
        // Ignore and fallback
      }
    }
  }

  // XML Fallback
  const xmlRegex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/gi;
  const xmlMatch = xmlRegex.exec(content);
  if (xmlMatch) {
    const actionName = xmlMatch[1];
    const innerContent = xmlMatch[2];
    const parsed = { action: actionName };

    const tagRegex = /<([a-z0-9_]+)>([\s\S]*?)<\/\1>/gi;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(innerContent)) !== null) {
      parsed[tagMatch[1]] = tagMatch[2].trim();
    }
    return parsed;
  }

  // Qwen Special Format
  const toolCallsRegex = /\[TOOL_CALLS\]([a-zA-Z0-9_]+)\[ARGS\](\{[\s\S]*?\})/i;
  const toolCallsMatch = toolCallsRegex.exec(content);
  if (toolCallsMatch) {
    const actionName = toolCallsMatch[1].trim();
    const rawArgs = toolCallsMatch[2].trim();
    try {
      const parsedArgs = JSON.parse(rawArgs);
      return { action: actionName, ...parsedArgs };
    } catch (e) {
      try {
        const parsedArgs = JSON.parse(cleanMalformedJsonString(rawArgs));
        return { action: actionName, ...parsedArgs };
      } catch (e2) {
        // Ignore
      }
    }
  }

  // Final heuristic regex fallback
  try {
    const actionMatch = /"action"\s*:\s*"([^"]+)"/i.exec(content);
    if (actionMatch) {
      const actionVal = actionMatch[1];
      const parsed = { action: actionVal };
      const fields = ['command', 'path', 'content', 'search', 'explanation', 'target', 'query', 'url', 'mode'];
      fields.forEach(f => {
        const fieldRegex = new RegExp(`"${f}"\\s*:\\s*"([^"]*)"`, 'i');
        const m = fieldRegex.exec(content);
        if (m) {
          parsed[f] = m[1];
        }
      });
      return parsed;
    }
  } catch (e) {}

  return null;
}

async function getDynamicSystemPrompt(steps) {
  const memoryPrompt = await getMemoryPrompt(agentState.task);
  const workspaceRules = await getWorkspaceRulesPrompt();
  
  let dynamicSystemPrompt = config.systemPrompt;
  
  if (config.forceTaskPlan && (!agentState.planSteps || agentState.planSteps.length === 0)) {
    dynamicSystemPrompt += `\n\n[CRITICAL INSTRUCTION: INITIAL PLANNING PHASE]\nYou are currently in the initial planning phase. You MUST use the 'task_plan' tool to create a step-by-step plan for the user's request. You are STRICTLY FORBIDDEN from using any other tools until the plan is created. Your response must contain ONLY the 'task_plan' action.\n`;
  } else if (agentState.planSteps && agentState.planSteps.length > 0) {
    dynamicSystemPrompt = dynamicSystemPrompt.replace(/\n\s*9\.\s*\{\"action\"\:\s*\"task_plan\"[\s\S]*?Swarm Mode is active\./g, '\n[task_plan tool is disabled: plan has already been created]');
  }
  
  if (memoryPrompt) {
    dynamicSystemPrompt += memoryPrompt;
  }
  if (workspaceRules) {
    dynamicSystemPrompt += workspaceRules;
  }

  if (agentState.activeGuideName && agentState.activeGuideContent) {
    dynamicSystemPrompt += `\n\n=== ACTIVE GUIDE MODE INSTRUCTIONS (${agentState.activeGuideName}) ===\n${agentState.activeGuideContent}\n=======================================================\n`;
  }

  let activeRole = 'Agent';
  if (config.swarmMode) {
    if (steps === 1) {
      activeRole = 'Planner';
      dynamicSystemPrompt += `\n\n[Swarm Role: Planner Agent]\nYour only job right now is to plan and decompose the task into 3-7 logical steps. You MUST call the 'task_plan' tool with these steps. Do not perform other actions yet.`;
    } else if (agentState.messages.length > 0 && agentState.messages[agentState.messages.length - 1].content.includes('"success": false')) {
      activeRole = 'Tester';
      dynamicSystemPrompt += `\n\n[Swarm Role: QA Tester Agent]\nThe previous developer execution encountered a failure. Analyze the error logs and files, and write instructions to fix the error. Explain the problem clearly, then proceed with the corrected development steps.`;
    } else {
      activeRole = 'Developer';
      dynamicSystemPrompt += `\n\n[Swarm Role: Developer Agent]\nYou are the Developer Agent. Your job is to implement the plan step-by-step. Focus on the current pending steps: ${JSON.stringify(agentState.planSteps.filter(s => s.status !== 'completed'))}. Call appropriate tools (execute_command, write_file, take_screenshot, etc.) to complete the steps.`;
    }
  }
  return { dynamicSystemPrompt, activeRole };
}

// Maximum number of messages sent to LLM per request (prevents context window overflow)

function resolveManualBridgeResponse(responseText) {
  if (manualBridgeResolver && agentState.status === 'manual_bridge') {
    const resolver = manualBridgeResolver;
    manualBridgeResolver = null;
    resolver(responseText);
    return true;
  }
  return false;
}

module.exports = { llmFetch, cleanMalformedJsonString, parseAssistantAction, resolveManualBridgeResponse, getDynamicSystemPrompt };
