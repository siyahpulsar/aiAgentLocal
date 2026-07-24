let currentFilePath = null;
let currentFolderPath = null;
let ws = null;
let authFailed = false;

// Initialize WebSocket to local server
function initWebSocket() {
  if (authFailed) return; // Don't reconnect if auth failed; wait for user to set key

  ws = new WebSocket('ws://127.0.0.1:3000');

  ws.onopen = () => {
    authFailed = false;
    document.getElementById('agent-status').textContent = 'Connecting...';
    document.getElementById('agent-status').style.color = '#ffc107';

    const savedKey = localStorage.getItem('founderKey') || '';
    const authKeyEl = document.getElementById('setting-auth-key');
    if (authKeyEl) authKeyEl.value = savedKey;
    ws.send(JSON.stringify({ type: 'auth', key: savedKey }));
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }

    if (data.type === 'auth_success') {
      document.getElementById('agent-status').textContent = 'Online';
      document.getElementById('agent-status').style.color = '#28a745';
      appendMessage('System', '✅ Authentication successful.', 'sys');
    } else if (data.type === 'state_patch' || data.type === 'state') {
      const state = data.patch || data;
      if (state.newMessages) {
        state.newMessages.forEach(msg => {
          if (msg.role === 'assistant') appendMessage('Agent', msg.content, 'agent');
        });
      }
      if (state.pendingAction && !state.pendingActionResolved) {
        showApproval(state.pendingAction);
      } else {
        hideApproval();
      }
    } else if (data.type === 'settings') {
      const s = data.settings || {};
      if (s.bannedCommands) document.getElementById('setting-blacklist').value = s.bannedCommands.join(', ');
      if (s.systemPrompt)   document.getElementById('setting-prompt-extra').value = s.systemPrompt;
      if (s.modelName)      document.getElementById('setting-model').value = s.modelName;
    }
  };

  ws.onclose = (event) => {
    document.getElementById('agent-status').textContent = 'Offline';
    document.getElementById('agent-status').style.color = '#dc3545';

    // Code 1008 = Policy Violation (server closes when auth fails)
    // Don't auto-reconnect on auth failures
    if (event.code === 1008 || event.code === 1000) {
      authFailed = true;
      appendMessage('System', '❌ Auth rejected. Open Settings ▲ (bottom bar), enter your FOUNDER_KEY, then click Save Settings to reconnect.', 'sys');
    } else {
      setTimeout(initWebSocket, 3000);
    }
  };
}

initWebSocket();

function appendMessage(sender, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.style.marginBottom = '8px';
  const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  div.innerHTML = `<strong>${sender}:</strong> <span>${safe}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Chat Form
document.getElementById('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    appendMessage('You', text);
    ws.send(JSON.stringify({ type: 'user_message', content: text }));
    input.value = '';
  } else {
    appendMessage('System', '⚠️ Not connected. Check FOUNDER_KEY in Settings.');
  }
};

// Approval logic
let currentAction = null;
function showApproval(action) {
  currentAction = action;
  document.getElementById('pending-action-details').textContent =
    `Action: ${action.action}\nTarget: ${action.command || action.path || action.url || ''}`;
  document.getElementById('approval-box').classList.remove('hidden');
}
function hideApproval() {
  document.getElementById('approval-box').classList.add('hidden');
  currentAction = null;
}

document.getElementById('btn-approve-action').onclick = () => {
  if (ws && currentAction) {
    ws.send(JSON.stringify({ type: 'approve_action', action: currentAction }));
    hideApproval();
  }
};
document.getElementById('btn-reject-action').onclick = () => {
  if (ws) {
    ws.send(JSON.stringify({ type: 'reject_action', feedback: 'Rejected by IDE user.' }));
    hideApproval();
  }
};

// Folder / File Explorer logic
document.getElementById('btn-open-folder').onclick = () => {
  alert('Please use the top menu: File > Open Folder');
};

if (window.electronAPI) {
  window.electronAPI.onOpenedFolder(async (folderPath) => {
    currentFolderPath = folderPath;
    await renderFileTree(folderPath);

    // Tell the agent server to use this folder as working directory
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'update_cwd', cwd: folderPath }));
      appendMessage('System', `📂 Workspace set to: ${folderPath}`);
    } else {
      appendMessage('System', `⚠️ Folder loaded locally but agent is offline — reconnect to sync workspace.`);
    }
  });
}

async function renderFileTree(folderPath) {
  if (!window.electronAPI) return;
  const treeContainer = document.getElementById('file-tree');
  treeContainer.innerHTML = '';

  // Show workspace path in label
  const wsLabel = document.getElementById('workspace-label');
  if (wsLabel) {
    wsLabel.textContent = folderPath;
    wsLabel.style.display = 'block';
  }

  const files = await window.electronAPI.readDir(folderPath);
  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#666;padding:8px;font-size:12px;';
    empty.textContent = '(empty folder)';
    treeContainer.appendChild(empty);
    return;
  }

  files.forEach(f => {
    const div = document.createElement('div');
    div.className = 'file-item ' + (f.isDirectory ? 'dir' : 'file');
    div.textContent = (f.isDirectory ? '📁 ' : '📄 ') + f.name;
    div.onclick = () => {
      if (!f.isDirectory) {
        document.querySelectorAll('.file-item').forEach(i => i.style.background = '');
        div.style.background = '#094771';
        openFile(f.path);
      } else {
        renderFileTree(f.path);
      }
    };
    treeContainer.appendChild(div);
  });
}

async function openFile(filePath) {
  if (!window.electronAPI) return;
  const content = await window.electronAPI.readFile(filePath);
  if (content !== null) {
    currentFilePath = filePath;
    document.getElementById('editor-title').textContent = filePath.split(/[\\\/]/).pop();
    const editor = document.getElementById('file-editor');
    editor.value = content;
    editor.disabled = false;
  }
}

document.getElementById('btn-save-file').onclick = async () => {
  if (!currentFilePath || !window.electronAPI) return;
  const content = document.getElementById('file-editor').value;
  const success = await window.electronAPI.writeFile(currentFilePath, content);
  if (success) {
    const title = document.getElementById('editor-title');
    const orig = title.textContent;
    title.textContent = orig + ' ✓';
    setTimeout(() => title.textContent = orig, 1500);
  } else {
    alert('Failed to save file.');
  }
};

// Toggle Settings
document.getElementById('btn-toggle-settings').onclick = () => {
  const content = document.getElementById('settings-content');
  const btn = document.getElementById('btn-toggle-settings');
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    btn.textContent = '▼';
  } else {
    content.classList.add('hidden');
    btn.textContent = '▲';
  }
};

// Save Settings & reconnect with new key
document.getElementById('btn-save-settings').onclick = () => {
  const blacklistRaw = document.getElementById('setting-blacklist').value;
  const promptExtra  = document.getElementById('setting-prompt-extra').value;
  const modelName    = document.getElementById('setting-model').value;
  const authKey      = document.getElementById('setting-auth-key').value.trim();

  localStorage.setItem('founderKey', authKey);

  if (ws && ws.readyState === WebSocket.OPEN) {
    // Just update settings; already connected
    ws.send(JSON.stringify({
      type: 'update_settings',
      settings: {
        bannedCommands: blacklistRaw.split(',').map(s => s.trim()).filter(Boolean),
        systemPrompt: promptExtra,
        modelName
      }
    }));
    appendMessage('System', '✅ Settings saved.');
  } else {
    // Reset flag and reconnect with the new key
    authFailed = false;
    if (ws) { try { ws.close(); } catch(e) {} }
    initWebSocket();
    appendMessage('System', '🔄 Reconnecting with new key...');
  }
};
