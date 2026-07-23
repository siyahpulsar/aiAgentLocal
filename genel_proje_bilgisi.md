# Genel Proje Bilgisi & Varlık Haritası (Low-Token Cheat Sheet)

> **Son Güncelleme:** 22 Temmuz 2026

## 📁 Dizin ve Modül Yapısı

### 1. Kök Dizin (Root)
- `server.js` (134 satır): HTTP & WebSocket sunucu başlatıcı, statik yayın, metrik yayınlama (CPU/RAM).
- `package.json` / `package-lock.json`: Proje bağımlılıkları (`express`, `ws`, `discord.js`, `puppeteer`, `dotenv`).
- `Dockerfile` / `docker-compose.yml`: Container dağıtım yapılandırmaları.
- `agent_readme.md`: Otomatik güncellenen dizin yapısı ve ajan geçmişi.

### 2. Modüller (`src/`)
- `src/agent.js` (515 satır): Ana ajan döngüsü `runAgentLoop()`, Swarm Mode rolleri (Planner, Developer, Tester), rehber yükleme, onay takibi.
- `src/llm/llmClient.js` (260 satır): LM Studio fetcher, 3-try retry backoff, 5 formatlı JSON/XML/Qwen parser, `getDynamicSystemPrompt()`, Manual AI Bridge.
- `src/state.js` (231 satır): Global `agentState`, `state_patch` delta diff WebSocket yayıncısı, 5s TTL rehber önbelleği.
- `src/security.js` (226 satır): Levenshtein banned words, `realpathSync` path traversal engelleme, risk skorlama.
- `src/memory.js` (354 satır): Vector RAG (LM Studio embeddings), TF-IDF keyword fallback, `agent_readme.md` otomasyonu.
- `src/tools/index.js` (240 satır): Merkezi `executeTool()` araç çalıştırıcı ve `checkVisionCapability()`.
- `src/tools/web.js` (280 satır): Puppeteer web gezgini, DDG web araması.
- `src/tools/system.js` (110 satır): Ekran görüntüsü alma, `execute_command`, `open_application`.
- `src/tools/filesystem.js` (95 satır): Dosya okuma, yazma, dizin listeleme (`.container` sandbox).
- `src/tools/image.js` (140 satır): Görsel indirme, URL image reader.
- `src/tools/filters.js` (110 satır): Çıktı filtreleme (`filter_output`), satır kontrolcü (`line_checker`).
- `src/ws/wsHandler.js` (350 satır): WebSocket mesaj işleyici (görev, onay, ayar değişimi).
- `src/discord/`: Discord bot istemcisi (`client.js`), komut işleyici (`commands.js`), müzik çalar (`musicPlayer.js`).

### 3. Yapılandırmalar (`config/`)
- `config/config.json`: Genel ajan ayarları (temperature, maxSteps, autoApprove).
- `config/security_rules.json`: Yasaklı kelimeler, yasaklı siteler ve izin verilen temel klasörler.
- `config/system_prompt.txt`: Sistem istemi (System prompt).
- `config/memory.json`: Geçmiş görev hafızası ve vektörler.

### 4. Raporlar ve Günlükler (`byAI/`)
- `byAI/agent_karsilastirmalari.md`: Projenin detaylı analiz raporu, 8 senaryo testi ve 100 puanlık Tier List.
- `byAI/aiDevLog-*.md`: Yapılan geliştirmelerin ve değişikliklerin tarihli kayıtları.
- `byAI/research_notes.md`: Mimari araştırma notları.
- `byAI/ideas_and_suggestions.md`: Fikir, öneri ve risk analizi.
- `byAI/before_publish.md`: Hassas veri sızıntı raporu.
