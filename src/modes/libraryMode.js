
const fs = require('fs');
const path = require('path');
const { agentState, broadcastState, broadcastTerminal, addMessage } = require('../state');
const { execute_command } = require('../tools/filesystem');
const { searchKnowledge } = require('../rag/vectorSearch');
const { llmFetch, cleanMalformedJsonString } = require('../llm/llmClient');

async function runLibraryModeSubLoop(searchQuery, explanation) {
  broadcastTerminal(`\n*** [LIBRARY MODE SUB-LOOP] Entering Library Search Mode... ***\n`);
  
  // 1. Save original messages history
  const originalMessages = [...agentState.messages];
  
  // 2. Clear current messages history
  agentState.messages = [];
  
  // 3. Set library mode initial query
  addMessage('user', `library_mode: true, search: ${searchQuery}, explanation: ${explanation}`);
  broadcastState();

  // 4. Find all .md files in MemoryLibrary
  const libraryDir = path.join(agentState.cwd, 'Libraries', 'MemoryLibrary');
  let files = [];
  try {
    const allFiles = await fs.promises.readdir(libraryDir);
    files = allFiles.filter(f => f.toLowerCase().endsWith('.md'));
  } catch {
    // Directory doesn't exist or unreadable — stay with empty array
  }

  // Pre-filter files using light local keyword matcher to find top candidates
  let candidateFiles = [...files];
  const queryTokens = searchQuery.toLowerCase().split(/[^a-zA-Z0-9çığöşüöäüæßàáâäæãåā]+/g).filter(w => w.length > 1);
  if (queryTokens.length > 0 && files.length > 0) {
    const scored = await Promise.all(files.map(async fileName => {
      let score = 0;
      const fileLower = fileName.toLowerCase();
      // Filename match has high weight
      queryTokens.forEach(t => {
        if (fileLower.includes(t)) score += 5;
      });

      // Content match
      try {
        const fullPath = path.join(libraryDir, fileName);
        const content = (await fs.promises.readFile(fullPath, 'utf-8')).toLowerCase();
        queryTokens.forEach(t => {
          if (content.includes(t)) {
            const count = (content.split(t).length - 1);
            score += Math.min(count, 5); // cap it to avoid long file bias
          }
        });
      } catch (e) {
        // Ignore read errors
      }
      return { fileName, score };
    }));

    const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    if (matched.length > 0) {
      candidateFiles = matched.slice(0, 10).map(s => s.fileName);
      broadcastTerminal(`> [LIBRARY PRE-FILTER] Local keyword search filtered ${files.length} down to ${candidateFiles.length} top candidates.\n`);
    } else {
      candidateFiles = files.slice(0, 10);
      broadcastTerminal(`> [LIBRARY PRE-FILTER] No keyword matches. Checking first ${candidateFiles.length} files as fallback.\n`);
    }
  }

  const selectedFiles = [];
  let index = 0;

  // Process candidate files in batches of 30 (usually fits in 1 batch now)
  while (index < candidateFiles.length) {
    const chunk = candidateFiles.slice(index, index + 30);
    index += 30;

    const promptContent = `Kütüphane modundasın. Şu an MemoryLibrary klasöründeki dosyalardan bazılarını incelemelisin.
Görevin ve aradığın bilgi: "${searchQuery}" (Açıklama: "${explanation}").

Aşağıdaki ${chunk.length} adet dosyadan hangilerinin aradığın bilgiyle ilişkili olduğunu dosya isimlerini yazarak seç.
Dosya listesi:
${chunk.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Seçim Formatı:
Sadece seçtiğin dosya isimlerini aralarında virgül olacak şekilde tek bir satırda yaz. (Örn: "abc.md, xyz.md, gfd.md")
Eğer bu listede aradığın bilgiyle ilişkili hiçbir dosya yoksa, sadece "no" veya "hayır" yaz.`;

    let repliedText = '';
    try {
      repliedText = await llmFetch([
        { role: 'system', content: 'You are a precise document selector. Answer exactly according to the requested format.' },
        { role: 'user', content: promptContent }
      ], 0.1, 'Library File Selection');
      repliedText = repliedText.trim();
    } catch (err) {
      console.error("Sub-loop batch fetch failed:", err);
    }

    broadcastTerminal(`> [LIBRARY SELECTION BATCH] Response: "${repliedText}"\n`);

    if (repliedText && repliedText.toLowerCase() !== 'no' && repliedText.toLowerCase() !== 'hayır') {
      const chosen = repliedText.split(',').map(s => s.trim()).filter(s => chunk.includes(s));
      selectedFiles.push(...chosen);
      broadcastTerminal(`> Selected files in this batch: ${chosen.join(', ')}\n`);
    }
  }

  const acceptedFiles = [];

  // Present each selected file content to agent
  for (const fileName of selectedFiles) {
    const filePath = path.join(libraryDir, fileName);
    let fileContent = '';
    try {
      fileContent = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      continue; // Skip if file disappeared
    }
    const promptCheck = `Seçilen Dosya: "${fileName}"
İçerik:
"""
${fileContent}
"""

Aranan Bilgi: "${searchQuery}"

Bu dosyanın içeriği aradığın bilgi ile eşleşiyor mu ve asıl hafızaya eklenmesini istiyor musun?
Eğer eklenmesini istiyorsan sadece "evet" veya "yes" veya "true" yaz.
İstemiyorsan sadece "hayır" veya "no" veya "false" yaz. Başka hiçbir şey yazma.`;

    let checkReply = '';
    try {
      const raw = await llmFetch([
        { role: 'system', content: 'Answer only yes or no.' },
        { role: 'user', content: promptCheck }
      ], 0.1, 'Library File Verification');
      checkReply = raw.trim().toLowerCase();
    } catch (err) {
      console.error("Content verification fetch failed:", err);
    }

    const isYes = checkReply.includes('evet') || checkReply.includes('yes') || checkReply.includes('true');
    broadcastTerminal(`> Verification for "${fileName}": "${checkReply}" -> ${isYes ? 'ACCEPTED' : 'REJECTED'}\n`);

    if (isYes) {
      acceptedFiles.push({ name: fileName, content: fileContent });
    }
  }

  // Restore original history
  agentState.messages = originalMessages;

  // Append results summary to history
  if (acceptedFiles.length > 0) {
    let contextMsg = `[System Context: Info]\nEn son library moduna girdin ve bu dosyaları elde ettin:\n`;
    acceptedFiles.forEach(file => {
      contextMsg += `- Dosya: "${file.name}" | İçerik:\n"""\n${file.content}\n"""\n\n`;
    });
    addMessage('system', contextMsg);
  } else {
    addMessage('system', `[System Context: Info]\nEn son library moduna girdin ancak aradığın kritere uyan hiçbir bilgi elde edemedin.`);
  }

  broadcastTerminal(`\n*** [LIBRARY MODE SUB-LOOP] Finished. Restoring original context... ***\n`);
  broadcastState();
}

module.exports = { runLibraryModeSubLoop };
