/**
 * Inspect Gemini DOM — Tìm đúng selectors cho upload, chat input, send button
 * Chạy: node src/scripts/inspect_gemini.js
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const COOKIE_PATH = path.resolve(process.cwd(), process.env.COOKIE_PATH || 'cookies/state.json');
const GEMINI_URL = process.env.GEMINI_URL || 'https://gemini.google.com/app';

async function main() {
  console.log('🔍 Inspecting Gemini DOM...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: COOKIE_PATH,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(GEMINI_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000)); // Wait for full render

  console.log('Current URL:', page.url());
  console.log('');

  // 1. Find all input[type="file"]
  const fileInputs = await page.$$eval('input[type="file"]', els => 
    els.map(el => ({
      tagName: el.tagName,
      type: el.type,
      accept: el.accept,
      hidden: el.hidden || el.style.display === 'none' || el.offsetParent === null,
      id: el.id,
      className: el.className,
      ariaLabel: el.getAttribute('aria-label'),
      parentTag: el.parentElement?.tagName,
      parentClass: el.parentElement?.className?.slice(0, 80),
    }))
  );
  console.log('=== INPUT[type="file"] ===');
  console.log(JSON.stringify(fileInputs, null, 2));
  console.log('');

  // 2. Find all buttons (look for upload/attachment/add buttons)
  const buttons = await page.$$eval('button', els => 
    els.map(el => ({
      text: el.innerText?.trim()?.slice(0, 50),
      ariaLabel: el.getAttribute('aria-label'),
      dataTooltip: el.getAttribute('data-tooltip'),
      className: el.className?.slice(0, 80),
      id: el.id,
    })).filter(b => 
      b.ariaLabel || b.text || b.dataTooltip
    )
  );
  console.log('=== BUTTONS ===');
  console.log(JSON.stringify(buttons, null, 2));
  console.log('');

  // 3. Find chat input areas
  const editables = await page.$$eval('[contenteditable="true"], textarea, .ql-editor', els =>
    els.map(el => ({
      tagName: el.tagName,
      contentEditable: el.contentEditable,
      className: el.className?.slice(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder'),
      role: el.getAttribute('role'),
      id: el.id,
    }))
  );
  console.log('=== CHAT INPUT AREAS ===');
  console.log(JSON.stringify(editables, null, 2));
  console.log('');

  // 4. Find the "+" button near chat (attachment button)
  const plusButtons = await page.$$eval('button, [role="button"]', els =>
    els.map(el => ({
      text: el.innerText?.trim()?.slice(0, 30),
      ariaLabel: el.getAttribute('aria-label'),
      className: el.className?.slice(0, 80),
      matTooltip: el.getAttribute('mattooltip'),
      jsname: el.getAttribute('jsname'),
    })).filter(b => {
      const label = (b.ariaLabel || '').toLowerCase();
      const text = (b.text || '').toLowerCase();
      return label.includes('add') || label.includes('attach') || label.includes('upload') || 
             label.includes('file') || label.includes('image') || label.includes('thêm') ||
             label.includes('đính') || label.includes('tải') || label.includes('hình') ||
             text === '+' || text === 'add';
    })
  );
  console.log('=== ATTACHMENT/ADD BUTTONS ===');
  console.log(JSON.stringify(plusButtons, null, 2));
  console.log('');

  // 5. Full page HTML snippet around the chat area (bottom area)
  const chatAreaHtml = await page.evaluate(() => {
    // Look for the main prompt area
    const promptAreas = document.querySelectorAll('.input-area, .prompt-area, [class*="prompt"], [class*="input-area"], [class*="chat-input"]');
    if (promptAreas.length > 0) {
      return Array.from(promptAreas).map(el => el.outerHTML.slice(0, 500)).join('\n---\n');
    }
    // Fallback: look for bottom area
    return 'No prompt area found by class. Dumping body classes: ' + document.body.className;
  });
  console.log('=== CHAT AREA HTML ===');
  console.log(chatAreaHtml?.slice(0, 2000));
  console.log('');

  // 6. Screenshot
  const ssPath = path.join(process.cwd(), 'logs', 'inspect_gemini.png');
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${ssPath}`);

  await browser.close();
  console.log('\n✅ Done');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
