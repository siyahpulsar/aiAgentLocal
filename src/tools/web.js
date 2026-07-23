const axios = require('axios');
const cheerio = require('cheerio');
const { agentState, broadcastTerminal } = require('../state');
const { checkBannedWebsites } = require('../security');

let sharedBrowser = null;
let puppeteerUseCount = 0;
const PUPPETEER_RECYCLE_LIMIT = 20;

async function getSharedBrowser() {
  const puppeteer = require('puppeteer');
  // Recycle browser every N uses to prevent RAM leaks
  if (puppeteerUseCount >= PUPPETEER_RECYCLE_LIMIT && sharedBrowser) {
    broadcastTerminal(`\n> [PUPPETEER] Recycling browser after ${puppeteerUseCount} uses to free memory...\n`);
    try { await sharedBrowser.close(); } catch (e) {}
    sharedBrowser = null;
    puppeteerUseCount = 0;
  }
  if (sharedBrowser && sharedBrowser.connected) {
    puppeteerUseCount++;
    return sharedBrowser;
  }
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch (e) {}
  }
  broadcastTerminal(`\n> [PUPPETEER] Launching new shared Puppeteer browser instance...\n`);
  sharedBrowser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  puppeteerUseCount = 1;
  return sharedBrowser;
}

process.on('exit', () => {
  if (sharedBrowser) {
    try {
      sharedBrowser.close();
    } catch (e) {}
  }
});

// Scrape DuckDuckGo Lite search results dynamically
async function searchDDGLite(query) {
  try {
    const response = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: `q=${encodeURIComponent(query)}`
    });
    if (!response.ok) {
      throw new Error(`DDG Lite HTTP Error ${response.status}`);
    }
    const html = await response.text();
    const links = [];
    const linkRegex = /<a\s+[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
    const hrefRegex = /href=['"]([^'"]+)['"]/i;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const fullTag = linkMatch[0];
      const title = linkMatch[1].replace(/<[^>]*>/g, '').trim();
      const hrefMatch = hrefRegex.exec(fullTag);
      if (hrefMatch) {
        links.push({ url: hrefMatch[1], title });
      }
    }

    const snippets = [];
    const snippetRegex = /<td\s+[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
    let snippetMatch;
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(snippetMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    const results = [];
    for (let i = 0; i < Math.min(links.length, 5); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || 'No snippet available.'
      });
    }
    return results;
  } catch (err) {
    console.error("DDG Lite search failed:", err.message);
    return null;
  }
}

// Scrape Yahoo / DuckDuckGo Lite search results dynamically
async function searchWeb(query) {
  broadcastTerminal(`\n> [WEB SEARCH] Query: "${query}"\n`);
  if (checkBannedWebsites(query)) {
    broadcastTerminal(`> [BLOCKED] Search query contains blacklisted website term.\n`);
    return { success: false, message: "Arama veya web sitesi erişimi güvenlik politikası nedeniyle engellendi." };
  }

  let yahooResults = [];
  let yahooFailed = false;
  try {
    const response = await fetch(`https://search.yahoo.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    const html = await response.text();
    const blocks = html.split(/<li[^>]*>/gi);
    const results = [];

    blocks.forEach(block => {
      const urlMatch = block.match(/<a[^>]+href="([^"]+)"/i);
      if (!urlMatch) return;

      let url = urlMatch[1];
      if (!url.includes('RU=')) return;

      const ruMatch = url.match(/\/RU=([^/]+)/);
      if (!ruMatch) return;

      const decodedUrl = decodeURIComponent(ruMatch[1]);
      if (decodedUrl.includes('yahoo.com')) return;

      const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (!titleMatch) return;

      let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();

      const snippetMatch = block.match(/<div[^>]*class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      let snippet = 'No snippet available.';
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }

      results.push({ title, url: decodedUrl, snippet });
    });

    const uniqueResults = [];
    const seenUrls = new Set();
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        uniqueResults.push(r);
      }
    }

    yahooResults = uniqueResults.slice(0, 5);
  } catch (error) {
    console.error("Yahoo Search failed, falling back to DDG Lite:", error.message);
    yahooFailed = true;
  }

  if (yahooFailed || yahooResults.length === 0) {
    broadcastTerminal(`> Yahoo search failed or returned no results. Falling back to DuckDuckGo Lite...\n`);
    const ddgResults = await searchDDGLite(query);
    if (ddgResults && ddgResults.length > 0) {
      broadcastTerminal(`> Found ${ddgResults.length} organic results from DuckDuckGo Lite.\n`);
      return { success: true, results: ddgResults };
    } else {
      broadcastTerminal(`> Both Yahoo and DuckDuckGo Lite searches failed or returned no results.\n`);
      return { success: false, message: "Arama işlemi başarısız oldu veya sonuç bulunamadı." };
    }
  }

  broadcastTerminal(`> Found ${yahooResults.length} organic results from Yahoo Search.\n`);
  return { success: true, results: yahooResults };
}

// Scrape website contents and extract text/media based on mode
async function viewWebsite(url, mode) {
  broadcastTerminal(`\n> [WEBSITE FETCH] URL: ${url} | Mode: ${mode || 'None'}\n`);
  agentState.lastVisitedUrl = url;
  if (checkBannedWebsites(url)) {
    broadcastTerminal(`> [BLOCKED] Website access is blacklisted.\n`);
    return { success: false, message: "Arama veya web sitesi erişimi güvenlik politikası nedeniyle engellendi." };
  }

  if (!mode) {
    broadcastTerminal(`> [WEBSITE FETCH (PAUSE)] Prompting AI for mode selection...\n`);
    return {
      success: true,
      message: "Sitede bulunan yazıları mı istersin? Yoksa URL'leri (linkler), görselleri veya dosyaları mı? Lütfen 'text', 'media' veya 'all' modlarından birini seçerek view_website aracını tekrar çağır."
    };
  }

  let usePuppeteer = false;
  let scrapeResult = { text: '', media: '' };

  try {
    broadcastTerminal(`> [WEBSITE FETCH (LIGHT)] Attempting to load via Axios+Cheerio...\n`);
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/120.0.0.0' },
      timeout: 10000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    $('script, style, nav, header, footer, noscript').remove();
    
    if (mode === 'text' || mode === 'all') {
      scrapeResult.text = $('body').text().replace(/\s+/g, ' ').trim();
    }
    
    if (mode === 'media' || mode === 'all') {
      const images = [];
      $('img').each((i, el) => {
        if (i >= 50) return false;
        const src = $(el).attr('src');
        const alt = $(el).attr('alt') || '';
        if (src) images.push(`[IMAGE] Alt: "${alt}" | Src: "${src}"`);
      });
      
      const links = [];
      $('a').each((i, el) => {
        if (i >= 100) return false;
        const href = $(el).attr('href');
        const linkText = $(el).text().replace(/\s+/g, ' ').trim();
        if (href) links.push(`[LINK] Text: "${linkText}" | Href: "${href}"`);
      });
      
      scrapeResult.media = [...images, ...links].join('\n');
    }

    if (scrapeResult.text.length < 200 && html.toLowerCase().includes('<noscript>')) {
      broadcastTerminal(`> [WEBSITE FETCH] Page seems to require JavaScript (SPA). Falling back to Puppeteer...\n`);
      usePuppeteer = true;
    }

  } catch (err) {
    broadcastTerminal(`> [WEBSITE FETCH (LIGHT)] Axios failed (${err.message}). Falling back to Puppeteer...\n`);
    usePuppeteer = true;
  }

  let page = null;
  if (usePuppeteer) {
    try {
      const browser = await getSharedBrowser();
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      scrapeResult = await page.evaluate((evalMode) => {
        const elements = document.querySelectorAll('script, style, nav, header, footer, noscript');
        elements.forEach(el => el.remove());

        let bodyText = '';
        if (evalMode === 'text' || evalMode === 'all') {
          bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
        }

        let mediaContent = '';
        if (evalMode === 'media' || evalMode === 'all') {
          const images = Array.from(document.querySelectorAll('img'))
            .map(img => img.getAttribute('src') ? `[IMAGE] Alt: "${img.getAttribute('alt') || ''}" | Src: "${img.getAttribute('src')}"` : '')
            .filter(Boolean).slice(0, 50);

          const links = Array.from(document.querySelectorAll('a'))
            .map(a => a.getAttribute('href') ? `[LINK] Text: "${a.innerText.replace(/\s+/g, ' ').trim()}" | Href: "${a.getAttribute('href')}"` : '')
            .filter(Boolean).slice(0, 100);

          mediaContent = [...images, ...links].join('\n');
        }

        return { text: bodyText, media: mediaContent };
      }, mode);

    } catch (err) {
      broadcastTerminal(`> [WEBSITE FETCH ERROR] Both methods failed: ${err.message}\n`);
      if (page) await page.close();
      return { success: false, message: `Hata oluştu: ${err.message}` };
    } finally {
      if (page) await page.close();
    }
  }

  let resultText = '';
  if (mode === 'text' || mode === 'all') {
    resultText += scrapeResult.text;
  }

  if (mode === 'media' || mode === 'all') {
    if (resultText.length > 0) resultText += '\n\n';
    resultText += `=== MEDIA & LINKS ===\n${scrapeResult.media || 'None'}\n======================\n`;
  }

  if (resultText.length === 0) {
    resultText = "No readable content found.";
  }

  const maxLength = 8000;
  if (resultText.length > maxLength) {
    resultText = resultText.substring(0, maxLength) + '\n\n[Content truncated for length...]';
  }

  broadcastTerminal(`> Downloaded and extracted ${resultText.length} characters (Mode: ${mode}).\n`);
  return { success: true, url, content: resultText };
}

module.exports = {
  searchDDGLite,
  searchWeb,
  viewWebsite
};
