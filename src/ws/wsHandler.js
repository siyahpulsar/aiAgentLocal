const fs = require('fs');
const path = require('path');
const { readEnv, writeEnv } = require('../utils/envManager');
const {
  agentState,
  config,
  getCanAnalyzeImages,
  broadcastState,
  broadcastTerminal,
  addMessage,
  getAvailableGuides,
  refreshGuidesCache
} = require('../state');
const { checkBannedWords } = require('../security');
const { checkVisionCapability } = require('../tools');
const { resolveManualBridgeResponse } = require('../llm/llmClient');
const {
  initializeTaskContextAndSelectMode,
  runAgentLoop
} = require('../agent');

module.exports = function setupWebSocketHandler(wss, founderKey, discordBot, resolvePendingAction, broadcastDiscordState, broadcastSandboxState) {
  wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket. Waiting for authentication...');
  let isAuthenticated = false;

  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log('Client failed to authenticate within 5 seconds. Closing connection.');
      ws.close(1008, "Authentication timeout");
    }
  }, 5000);

  const sendAdminData = async () => {
    try {
      const envObj = readEnv();
      const rulesPath = path.join(path.join(__dirname, '..', '..'), 'config', 'security_rules.json');
      const kurucuPath = path.join(path.join(__dirname, '..', '..'), 'config', 'kurucu.json');
      const permPath = path.join(path.join(__dirname, '..', '..'), 'config', 'permissions.json');
      const memoryPath = path.join(path.join(__dirname, '..', '..'), 'config', 'memory.json');
      const configPath = path.join(path.join(__dirname, '..', '..'), 'config', 'config.json');

      const readJsonSafe = async (p) => {
        try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return {}; }
      };
      const [securityRules, kurucuObj, permissionsObj, memoryObj, configJsonObj] = await Promise.all([
        readJsonSafe(rulesPath),
        readJsonSafe(kurucuPath),
        readJsonSafe(permPath).then(r => Array.isArray(r) ? r : []),
        readJsonSafe(memoryPath).then(r => Array.isArray(r) ? r : []),
        readJsonSafe(configPath).then(r => Array.isArray(r) ? r : []),
      ]);

      ws.send(JSON.stringify({
        type: 'admin_data',
        env: envObj,
        securityRules,
        kurucu: kurucuObj,
        permissions: permissionsObj,
        memory: memoryObj,
        configJson: configJsonObj
      }));
    } catch (e) {
      console.error("Failed to send admin data:", e);
    }
  };

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (!isAuthenticated) {
        if (data.type === 'auth') {
          // Verify auth key
          const crypto = require('crypto');
          let isValid = false;
          try {
            if (typeof data.key === 'string' && typeof founderKey === 'string' && data.key.length === founderKey.length) {
              isValid = crypto.timingSafeEqual(Buffer.from(data.key), Buffer.from(founderKey));
            } else if (!data.key && !founderKey) {
              isValid = true;
            }
          } catch (e) {}
          
          if (isValid) {
            isAuthenticated = true;
            clearTimeout(authTimeout);
            console.log('Client authenticated successfully.');
            
            // Send initial state upon successful authentication
            ws.send(JSON.stringify({ type: 'auth_success' }));
            ws.send(JSON.stringify({ type: 'state', ...agentState }));
            ws.send(JSON.stringify({ type: 'settings', settings: config }));
            ws.send(JSON.stringify({ type: 'discord_state', ...discordBot.getDiscordState() }));
            sendAdminData();
          } else {
            console.log('Client provided invalid auth key. Closing connection.');
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid admin key.' }));
            ws.close(1008, "Invalid admin key");
          }
        }
        return;
      }

      switch (data.type) {
        case 'user_message':
          if (agentState.status !== 'idle' && agentState.status !== 'completed' && agentState.status !== 'failed') {
            ws.send(JSON.stringify({ type: 'error', message: 'Agent is already busy running a task!' }));
            break;
          }
          const bannedWord = checkBannedWords(data.content);
          if (bannedWord) {
            broadcastTerminal(`\n  [BANNED WORD DETECTED] Task contains banned phrase: "${bannedWord}"\n  `);
            ws.send(JSON.stringify({ type: 'error', message: `İstek güvenlik kuralları gereği yasaklı bir kelime ("${bannedWord}") içeriyor! İşlem durduruldu.` }));
            agentState.status = 'failed';
            broadcastState();
            break;
          }
          agentState.task = data.content;
          agentState.status = 'thinking';
          broadcastState();

          if (getCanAnalyzeImages() === null) {
            await checkVisionCapability();
          }

          // Initialize context asynchronously, clear history, and select mode
          await initializeTaskContextAndSelectMode(data.content);

          // Trigger the agent execution loop
          runAgentLoop();
          break;

        case 'approve_action':
          resolvePendingAction({
            approved: true,
            action: data.action // contains potentially modified parameters
          });
          break;

        case 'reject_action':
          resolvePendingAction({
            approved: false,
            feedback: data.feedback
          });
          break;

        case 'abort_task':
          // Terminate active process if any
          if (agentState.activeCommandProcess) {
            try {
              agentState.activeCommandProcess.kill();
              broadcastTerminal(`\n  > [ABORTED] Active command process killed by user.\n  `);
            } catch (err) {
              console.error('Failed to kill active process:', err);
            }
          }
          agentState.status = 'idle';
          agentState.pendingAction = null;
          resolvePendingAction({ approved: false, feedback: 'Aborted by user' });
          addMessage('system', 'Task execution was aborted by the user.');
          broadcastState();
          break;

        case 'update_settings':
          // Modify properties on the config object reference directly
          Object.assign(config, data.settings);
          ws.send(JSON.stringify({ type: 'settings', settings: config }));
          broadcastTerminal(`> [SETTINGS] Config settings updated.\n  `);
          break;

        case 'clear_chat':
          agentState.messages = [];
          agentState.status = 'idle';
          agentState.task = null;
          agentState.pendingAction = null;
          if (agentState.activeCommandProcess) {
            agentState.activeCommandProcess.kill();
          }
          resolvePendingAction({ approved: false, feedback: 'Chat cleared' });
          broadcastState();
          broadcastTerminal(`> Chat cleared and agent reset.\n  `);
          break;

        case 'update_cwd':
          if (fs.existsSync(data.cwd)) {
            agentState.cwd = path.resolve(data.cwd);
            broadcastTerminal(`> Working directory changed to: ${agentState.cwd}\n  `);
            broadcastState();
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Specified folder directory does not exist!' }));
          }
          break;

        case 'manually_change_mode':
          const mName = data.guide_name;
          if (mName && mName.toLowerCase() !== 'none') {
            const guidesList = getAvailableGuides();
            const matchedG = guidesList.find(g => g.name.toLowerCase() === mName.toLowerCase());
            if (matchedG) {
              try {
                agentState.activeGuideName = matchedG.name;
                agentState.activeGuideContent = await fs.promises.readFile(matchedG.path, 'utf-8');
                broadcastTerminal(`> [MANUAL MODE] Loaded guide: ${matchedG.name}\n  `);
              } catch (err) {
                console.error("Failed to manually load guide:", err);
              }
            }
          } else {
            agentState.activeGuideName = null;
            agentState.activeGuideContent = null;
            broadcastTerminal(`> [MANUAL MODE] Deactivated guide mode.\n  `);
          }
          broadcastState();
          break;

        case 'save_guide':
          const saveName = data.name;
          const saveContent = data.content;
          if (saveName && saveContent !== undefined) {
            try {
              const filename = saveName.endsWith('.md') ? saveName : `${saveName}.md`;
              let guidesDir = path.join(agentState.cwd, 'Libraries', 'ObsiLibrary', 'ObsiLibrary');
              // Check which path exists (async)
              const altDir = path.join(agentState.cwd, 'Libraries', 'ObsiLibrary');
              const [primary, alt] = await Promise.all([
                fs.promises.access(guidesDir).then(() => true).catch(() => false),
                fs.promises.access(altDir).then(() => true).catch(() => false)
              ]);
              if (!primary) guidesDir = alt ? altDir : guidesDir;
              await fs.promises.mkdir(guidesDir, { recursive: true });
              const savePath = path.join(guidesDir, filename);
              await fs.promises.writeFile(savePath, saveContent, 'utf-8');
              broadcastTerminal(`> [GUIDE SAVED] Wrote guide ${filename} successfully.\n  `);
              refreshGuidesCache().catch(() => {}); // invalidate cache after write
              broadcastState();
            } catch (err) {
              console.error("Failed to save guide via WS:", err);
            }
          }
          break;

        case 'get_guide_content':
          const targetName = data.name;
          if (targetName) {
            const guidesList = getAvailableGuides();
            const foundG = guidesList.find(g => g.name.toLowerCase() === targetName.toLowerCase());
            if (foundG) {
              try {
                const content = await fs.promises.readFile(foundG.path, 'utf-8');
                ws.send(JSON.stringify({
                  type: 'guide_content',
                  name: foundG.name,
                  content
                }));
              } catch (err) {
                console.error("Failed to read guide content for WS:", err);
              }
            }
          }
          break;

        case 'update_discord_config':
          discordBot.updateDiscordConfig(data.connectionSpeedLimit);
          break;

        case 'add_discord_admin':
          discordBot.addDiscordAdmin(data.adminId);
          break;

        case 'delete_discord_admin':
          discordBot.deleteDiscordAdmin(data.index);
          break;

        case 'add_discord_user':
          discordBot.addDiscordUser(data.userId);
          break;

        case 'delete_discord_user':
          discordBot.deleteDiscordUser(data.index);
          break;

        case 'get_admin_data':
          sendAdminData();
          break;

        case 'save_admin_data':
          try {
            // Save .env if passed
            if (data.env) {
              writeEnv(data.env);
              if (data.env.DISCORD_TOKEN) process.env.DISCORD_TOKEN = data.env.DISCORD_TOKEN;
              if (data.env.PORT) process.env.PORT = data.env.PORT;
              if (data.env.FOUNDER_DISCORD_ID) process.env.FOUNDER_DISCORD_ID = data.env.FOUNDER_DISCORD_ID;
              if (data.env.FOUNDER_KEY) {
                process.env.FOUNDER_KEY = data.env.FOUNDER_KEY;
                founderKey = data.env.FOUNDER_KEY;
              }
            }
            const writes = [];
            if (data.securityRules) writes.push(fs.promises.writeFile(path.join(path.join(__dirname, '..', '..'), 'config', 'security_rules.json'), JSON.stringify(data.securityRules, null, 2), 'utf-8'));
            if (data.kurucu)       writes.push(fs.promises.writeFile(path.join(path.join(__dirname, '..', '..'), 'config', 'kurucu.json'), JSON.stringify(data.kurucu, null, 2), 'utf-8'));
            if (data.permissions)  writes.push(fs.promises.writeFile(path.join(path.join(__dirname, '..', '..'), 'config', 'permissions.json'), JSON.stringify(data.permissions, null, 2), 'utf-8'));
            if (data.configJson)   writes.push(fs.promises.writeFile(path.join(path.join(__dirname, '..', '..'), 'config', 'config.json'), JSON.stringify(data.configJson, null, 2), 'utf-8'));
            await Promise.all(writes);
            broadcastTerminal(`> [ADMIN] Ayarlar başarıyla güncellendi.\n  `);
            await sendAdminData();
            broadcastDiscordState();
          } catch (err) {
            console.error("Failed to save admin data:", err);
            ws.send(JSON.stringify({ type: 'error', message: 'Ayarlar kaydedilirken hata oluştu: ' + err.message }));
          }
          break;

        case 'clear_memories':
          try {
            const memoryPath = path.join(path.join(__dirname, '..', '..'), 'config', 'memory.json');
            await fs.promises.writeFile(memoryPath, '[]', 'utf-8');
            broadcastTerminal(`> [ADMIN] Hafıza geçmişi temizlendi.\n  `);
            await sendAdminData();
          } catch (err) {
            console.error("Failed to clear memories:", err);
            ws.send(JSON.stringify({ type: 'error', message: 'Hafıza temizlenirken hata oluştu: ' + err.message }));
          }
          break;

        case 'manual_ai_response':
          // User pasted an AI response into the Manual Bridge panel
          if (agentState.status === 'manual_bridge') {
            const resolved = resolveManualBridgeResponse(data.content);
            if (!resolved) {
              ws.send(JSON.stringify({ type: 'error', message: 'No active manual bridge session. Please start a task first.' }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Agent is not in manual bridge mode.' }));
          }
          break;

        case 'get_sandbox_files':
          broadcastSandboxState();
          break;

        case 'commit_sandbox_file':
          try {
            const relPath = data.path;
            const sourcePath = path.join(path.join(__dirname, '..', '..'), '.container', relPath);
            const destPath = path.join(path.join(__dirname, '..', '..'), relPath);
            if (fs.existsSync(sourcePath)) {
              const destDir = path.dirname(destPath);
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(sourcePath, destPath);
              fs.unlinkSync(sourcePath);
              
              // Temizleme: boş klasörleri sil
              let curDir = path.dirname(sourcePath);
              while (curDir !== path.join(path.join(__dirname, '..', '..'), '.container')) {
                if (fs.readdirSync(curDir).length === 0) {
                  fs.rmdirSync(curDir);
                  curDir = path.dirname(curDir);
                } else {
                  break;
                }
              }
              
              broadcastTerminal(`> [SANDBOX] Dosya başarıyla çalışma alanına aktarıldı: ${relPath}\n  `);
              broadcastSandboxState();
            }
          } catch (err) {
            console.error("Failed to commit sandbox file:", err);
            ws.send(JSON.stringify({ type: 'error', message: 'Dosya aktarılırken hata: ' + err.message }));
          }
          break;

        case 'discard_sandbox_file':
          try {
            const relPath = data.path;
            const sourcePath = path.join(path.join(__dirname, '..', '..'), '.container', relPath);
            if (fs.existsSync(sourcePath)) {
              fs.unlinkSync(sourcePath);
              
              let curDir = path.dirname(sourcePath);
              while (curDir !== path.join(path.join(__dirname, '..', '..'), '.container')) {
                if (fs.readdirSync(curDir).length === 0) {
                  fs.rmdirSync(curDir);
                  curDir = path.dirname(curDir);
                } else {
                  break;
                }
              }
              
              broadcastTerminal(`> [SANDBOX] Konteyner değişikliği reddedildi ve silindi: ${relPath}\n  `);
              broadcastSandboxState();
            }
          } catch (err) {
            console.error("Failed to discard sandbox file:", err);
            ws.send(JSON.stringify({ type: 'error', message: 'Dosya silinirken hata: ' + err.message }));
          }
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected.');
  });
});
};
