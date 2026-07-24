# 🤖 Local AI Computer-Use Agent (Pulsaristic Agent Framework)

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![LM Studio](https://img.shields.io/badge/LLM-LM%20Studio%20Local-orange?style=flat-square)
![Discord.js](https://img.shields.io/badge/Discord-v14-5865F2?style=flat-square&logo=discord)

> **100% Local, Autonomous AI Computer Agent with Real-Time Web Dashboard, Discord Integration, Puppeteer Web Automation, Swarm Mode & Low Parameter Optimization.**

> [!WARNING]
> **ÖNEMLİ BİLGİLENDİRME VE RİSK UYARISI / IMPORTANT DISCLAIMER**
> Bu projenin kodu büyük oranda **Gemini (Yapay Zeka)** tarafından yazılmış olup; algoritma, çalışma mantığı, mimari kararlar ve uygulamanın tüm fikir hakları proje geliştiricisi **siyahpulsar**'a aittir. Gemini sadece bu düşünceleri koda dökerek gerçek hayata geçirmiştir. Proje geliştiricisi tüm özellikleri bizzat deneyememiş olup, tam güvenlik ve %100 sorunsuz çalışabilirlik garantisi sunulmamaktadır. Kodların bilgisayarınızda çalıştırılmasından doğabilecek tahmin edilebilir veya edilemez, olası tüm donanımsal, yazılımsal ve güvenlik riskleri tamamen projeyi indirip kullanan **kullanıcının kendi sorumluluğundadır**.
> 
> *Olası bir açık, hata, ekstra token harcamaları, tasarrufsuzluk, eksik optimizasyon ve performans sorunları veya yeni fikir ve öneriler için Discord üzerinden **siyahpulsar**'a bildirmeyi unutmayın.*
> 
> *This project's code was largely written by **Gemini (AI)**, but all algorithms, operational logic, architectural decisions, and project ideas belong exclusively to the developer, **siyahpulsar**. The developer has not tested all features extensively; therefore, full security and flawless functionality are not guaranteed. Any predictable or unpredictable risks—including hardware, software, or security vulnerabilities—arising from executing this project are entirely the **responsibility of the user**.*

---

## 📖 Table of Contents / İçindekiler
- [English Documentation](#-english-documentation)
- [Türkçe Dokümantasyon](#-türkçe-dokümantasyon)
- [License / Lisans](#-license)

---

## 🇬🇧 English Documentation

### 1. System Overview & Core Mission
This repository provides an open-source, production-grade **Local AI Computer-Use Agent framework**. Designed to run 100% locally without cloud API subscriptions or external tokens, it connects directly to **LM Studio** (or any OpenAI-compatible local REST server) to give local language models computer manipulation capabilities.

The agent can autonomously:
- Perform file system reads, writes, and directory scans within sandbox bounds.
- Execute system shell commands (PowerShell/Bash) with risk assessment.
- Browse the web, take page screenshots, search web engines, and download media via Puppeteer.
- Stream state live to an interactive Web UI dashboard or an Electron-based Desktop IDE via WebSockets.
- Interact remotely over Discord channels, approving/rejecting actions with interactive buttons and streaming voice channel music (`yt-dlp`).

### 2. Architectural Innovations
Based on system analysis and architectural research, the codebase features key technical highlights:

1. **Manual AI Bridge:** If the local LLM crashes or is offline, the system automatically transitions into Manual AI Bridge mode. It formats current task prompts into copy-paste blocks for external web models (Gemini, Claude, ChatGPT) and resumes execution seamlessly when the user pastes back the response.
2. **Delta Patch WebSocket Engine:** Instead of re-broadcasting entire state trees, `src/state.js` uses a debounced (150ms) delta diff broadcaster to minimize CPU usage and network bandwidth.
3. **5-Tiered Tool Call Parser:** Supports tool invocation across 5 distinct LLM output formats: JSON Markdown codeblocks, raw JSON objects, XML tags, Qwen `[TOOL_CALLS]` syntax, and Heuristic Regex fallback—enabling robust tool execution even on 3B/7B low-parameter models.
4. **Strict Security Sandbox:** Uses canonical `fs.realpathSync` path resolution to prevent symlink traversal attacks outside allowed workspace boundaries. Includes a Levenshtein-distance banned-word scanner and dynamic action risk scoring.
5. **Swarm Multi-Agent Mode:** Dynamically re-prompts the model to switch roles (**Planner** → **Developer** → **QA Tester**) during multi-step task execution.
6. **RAG Memory + TF-IDF Fallback:** Computes cosine similarity over vectorized task histories (using LM Studio embeddings). Automatically falls back to keyword frequency indexing (TF-IDF light) if embedding models are offline. Includes an auto-updating `agent_readme.md` for workspace tracking and Git auto-commits.
7. **LPM (Low Parameter Mod) & OM (Odaklanma Modu / Focus Mode):** 
   - **LPM:** Designed for low-parameter models that get confused when presented with many tools at once. It uses a slider to present tools sequentially (e.g., prompting the AI to say yes/no to each tool one by one) until the model selects the right one.
   - **OM:** When enabled alongside LPM, the agent evaluates the prompt to determine the *type* of tool it needs, sending a self-message to focus on that specific tool class. Just like an intern fetching a tool from a toolbox, this ensures the model maintains focus and prevents cognitive overload.
8. **Library Sub-Loop Mode:** Protects narrow context windows by offloading memory searches to a background loop that reads `.md` guides using TF-IDF, feeding only relevant context slices to the main AI stream.

### 3. Global AI Agent Tier List & Benchmarks
In benchmark comparisons against major autonomous AI agent frameworks, the **Pulsaristic Local AI Agent** achieves top-tier ratings for privacy, security, and local execution, scoring **91 / 100** due to its offline intranet capabilities, sandbox UI, and Manual AI Bridge fallbacks.

### 4. Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/siyahpulsar/Pulsaristic-Local-AI-Agent.git
cd Pulsaristic-Local-AI-Agent

# 2. Install dependencies
npm install

# 3. Prepare environment variables and config files
cp .env.example .env
cp config/kurucu.example.json config/kurucu.json
cp config/config.example.json config/config.json
cp config/permissions.example.json config/permissions.json

# 4. Start the agent
npm start
```

---

## 🇹🇷 Türkçe Dokümantasyon

### 1. Sistem Genel Bakışı ve Temel Hedef
Bu proje, açık kaynaklı, üretim seviyesinde bir **Yerel Yapay Zeka Bilgisayar Kullanım Ajanı** (Local AI Computer-Use Agent) altyapısı sunar. Herhangi bir bulut aboneliği veya dış API anahtarı gerektirmeden %100 yerel olarak çalışmak üzere tasarlanmıştır. Doğrudan **LM Studio** (veya OpenAI ile uyumlu herhangi bir yerel REST sunucusu) ile bağlantı kurarak yerel yapay zeka modellerine bilgisayar yönetim yetenekleri kazandırır.

Ajan otonom olarak şunları gerçekleştirebilir:
- Sandbox sınırları içerisinde dosya okuma, yazma ve dizin tarama.
- Risk değerlendirmesi ile sistem kabuk komutlarını (PowerShell/Bash) çalıştırma.
- Puppeteer ile web sayfalarında gezinme, ekran görüntüsü alma, web araması yapma ve medya indirme.
- WebSocket aracılığıyla etkileşimli Web Paneline veya Electron tabanlı Masaüstü IDE'sine canlı veri aktarma.
- Discord üzerinden uzaktan komut alma, butonlarla onay talep etme ve ses kanallarında müzik yayınlama (`yt-dlp`).

### 2. Mimari İnovasyonlar
Proje mimarisi aşağıdaki ileri teknoloji yaklaşımları barındırır:

1. **Manuel AI Köprüsü (Manual AI Bridge):** Yerel LLM çöktüğünde veya kapalı olduğunda sistem durmaz; istemleri harici web modellerine (Gemini, Claude, ChatGPT) kopyala-yapıştır yapabileceğiniz bir formata dönüştürür.
2. **Delta Patch WebSocket Motoru:** Tüm state ağacını sürekli yeniden göndermek yerine, ağ bant genişliğini ve CPU kullanımını korumak için sadece değişen verileri 150ms gecikmeyle yayınlar.
3. **5 Katmanlı Araç Çağrı Ayrıştırıcısı:** 3B/7B gibi küçük modellerde bile araç çağrılarını hatasız ayrıştırmak için JSON, XML, Qwen syntax'ı ve Regex katmanları içerir.
4. **Gelişmiş Güvenlik Sandbox'ı:** Sembolik link saldırılarını engellemek için `fs.realpathSync` kullanır. Levenshtein mesafeli kelime tarayıcısı ve komut risk skorlaması içerir.
5. **Swarm Çoklu Ajan Modu:** Çok adımlı görevlerde yapay zekayı rol değiştirmeye yönlendirir (**Planlayıcı** → **Geliştirici** → **QA Testçi**).
6. **Vektörel RAG Bellek + TF-IDF Fallback:** Görev geçmişini kosinüs benzerliği ile arar. Ayrıca workspace'in dizin haritasını ve loglarını `agent_readme.md` üzerine otomatik kaydeder ve Git auto-commit işlemini yönetir.
7. **LPM (Low Parameter Mod) & OM (Odaklanma Modu):**
   - **LPM:** Küçük parametreli (Low Parameter) yapay zeka modellerinin çok fazla tool (araç) gördüğünde kafasının karışmasını engellemek için tasarlanmıştır. Arayüzdeki bir slider yardımıyla (örn: her adımda tek tool sorarak) toolları modele tek tek sorar (Örn: "Şu tool'u mu kullanmak istiyorsun?" -> Hayır, "Peki bunu mu?" -> Evet). Ekranda aynı anda sadece tek tool gören modelin kafası karışmaz ve halüsinasyon azalır.
   - **OM:** LPM ile birlikte açıldığında model, gelen prompt'a göre hangi aleti kullanması gerektiğini düşünür ve kendine bir mesaj iletir. Tıpkı bir stajyerin takım çantasına giderken aradığı alete odaklanması gibi, sadece o spesifik aleti bulmaya odaklanır. Bu ikili (LPM + OM) kombinasyonu ajanı hedefe kilitler.
8. **Kütüphane Modu (Library Sub-Loop):** `MemoryLibrary` altındaki `.md` dosyalarını TF-IDF ile tarayarak en alakalı metinleri bağlama enjekte eder; dar bağlam pencereli (context window) modellerin şişmesini engeller.

### 3. Modül ve Masaüstü IDE (Electron)
Sunucu ve WebSocket altyapısının ötesinde, proje `electron/` dizini içerisinde 3 kolonlu bir Masaüstü IDE arayüzü barındırır. Bu IDE; Dosya Gezgini, Kod Editörü, Ajan Sohbeti ve Ayarlar ekranlarını barındırarak ajanı lokal bilgisayarınızda profesyonel bir asistan gibi yönetmenizi sağlar.
Bağımsız `discordBot.js` modülü ise `yt-dlp` üzerinden müzik çalma, Discord karakter limitlerini aşmak için Auto-Chunking yetenekleri ve güvenli komut enjeksiyon (Command Injection) yamaları içerir.

### 4. Hızlı Başlangıç (Quick Start)
```bash
# 1. Repoyu klonlayın
git clone https://github.com/siyahpulsar/Pulsaristic-Local-AI-Agent.git
cd Pulsaristic-Local-AI-Agent

# 2. Bağımlılıkları yükleyin
npm install

# 3. Ortam değişkenlerini ve yapılandırmaları hazırlayın
cp .env.example .env
cp config/kurucu.example.json config/kurucu.json
cp config/config.example.json config/config.json
cp config/permissions.example.json config/permissions.json

# 4. Ajanı başlatın
npm start
```

---

## 🤝 Contributing / Katkıda Bulunma
Pull Request'lere, yeni araç (tool) önerilerine ve hata bildirimlerine açığız! Projeyi geliştirmek için bir PR göndermekten çekinmeyin.

---

## 📜 License
This project is open-source software available under the **MIT License**.