/**
 * Browser Agent Module
 * 
 * Core Engine: Playwright-based browser automation cho Gemini Web UI.
 * - Nạp session cookies để bypass login
 * - Upload video qua DOM injection
 * - Gửi prompt và scrape response
 * - Human-like behavior: random delays, typing speed
 * 
 * QUAN TRỌNG: Khi Gemini thay đổi UI, cập nhật file src/config/selectors.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createModuleLogger } = require('../utils/logger');
const SELECTORS = require('../config/selectors');

const log = createModuleLogger('BrowserAgent');

class BrowserAgent {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
  }

  // ──────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────

  /**
   * Khởi tạo browser và nạp session cookies
   */
  async initialize() {
    if (this.isInitialized) {
      log.warn('Browser already initialized, closing existing instance');
      await this.close();
    }

    const userDataDir = path.resolve(process.cwd(), 'cookies/browser_profile');

    if (!fs.existsSync(userDataDir)) {
      throw new Error(
        `Browser profile not found at: ${userDataDir}\n` +
        'Chạy "npm run login" để đăng nhập Google trước.'
      );
    }

    const isHeadless = String(process.env.HEADLESS).trim() !== 'false';
    log.info('Launching browser with persistent context...', { headless: isHeadless });

    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: isHeadless,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      permissions: ['clipboard-read', 'clipboard-write'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    });

    this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();
    this.isInitialized = true;

    log.info('Browser initialized successfully');
  }

  /**
   * Đóng browser và giải phóng tài nguyên
   */
  async close() {
    try {
      if (this.page) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch (error) {
      log.warn('Error closing browser', { error: error.message });
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
      this.isInitialized = false;
      log.info('Browser closed');
    }
  }

  // ──────────────────────────────────
  // Navigation & Auth
  // ──────────────────────────────────

  /**
   * Mở Gemini và verify đã đăng nhập
   */
  async navigateToGemini() {
    const geminiUrl = process.env.GEMINI_URL || 'https://gemini.google.com/app';
    
    log.info('Navigating to Gemini...', { url: geminiUrl });
    await this.page.goto(geminiUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    await this._randomDelay(2000, 4000);
    
    // Đảm bảo luôn bắt đầu một cuộc trò chuyện mới tinh
    await this.newChat();

    // Check nếu bị redirect về trang login
    const currentUrl = this.page.url();
    if (currentUrl.includes('accounts.google.com')) {
      throw new Error(
        'Session expired! Bị redirect về trang đăng nhập.\n' +
        'Chạy "npm run login" để đăng nhập lại.'
      );
    }

    // Verify đã ở Gemini
    log.info('Successfully navigated to Gemini', { url: currentUrl });
    return true;
  }

  /**
   * Mở phiên chat mới trên Gemini
   */
  async newChat() {
    log.info('Opening new chat...');
    
    try {
      // Cách 1: Click nút New Chat
      const newChatBtn = await this.page.$(SELECTORS.NEW_CHAT_BUTTON);
      if (newChatBtn) {
        await newChatBtn.click();
        await this._randomDelay(2000, 3000);
        log.info('New chat opened via button');
        return;
      }
    } catch (e) {
      log.debug('New chat button not found, navigating directly');
    }

    // Cách 2: Navigate trực tiếp
    const geminiUrl = process.env.GEMINI_URL || 'https://gemini.google.com/app';
    await this.page.goto(geminiUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await this._randomDelay(2000, 4000);
    log.info('New chat opened via navigation');
  }

  // ──────────────────────────────────
  // Video Upload
  // ──────────────────────────────────

  /**
   * Upload file video lên Gemini qua DOM File Injection
   * 
   * Flow thực tế trên Gemini UI:
   * 1. Click nút "+" (Nội dung tải lên và công cụ) → mở menu
   * 2. Chờ input[type="file"] xuất hiện trong DOM
   * 3. Inject file vào input element
   * 4. Chờ Gemini processing xong
   * 
   * @param {string} filePath - Đường dẫn tuyệt đối đến file .mp4
   * @param {number} [timeout=120000] - Timeout chờ upload xong
   */
  async uploadVideo(filePath, timeout = 120000) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file not found: ${filePath}`);
    }

    const absolutePath = path.resolve(filePath);
    log.info('Uploading video...', { filePath: absolutePath });

    // Bước 1: Kiểm tra xem input[type="file"] đã có sẵn trên DOM chưa
    let fileInput = await this.page.$(SELECTORS.FILE_INPUT);
    
    if (!fileInput) {
      // Bước 2: Click nút attachment "+" để kích hoạt file input
      log.debug('File input not found, clicking attachment button...');
      
      try {
        // Tìm nút "+" (Nội dung tải lên và công cụ) và click lần đầu
        await this.page.waitForSelector(SELECTORS.ATTACHMENT_BUTTON, { timeout: 10000 });
        await this.page.click(SELECTORS.ATTACHMENT_BUTTON);
        log.debug('Attachment button clicked (1st attempt)');
        await this._randomDelay(1500, 2500);

        // Handle unexpected popups (like Google Workspace) that appear AFTER clicking +
        log.debug('Checking for blocking popups via DOM injection...');
        let popupDismissed = false;
        
        for (let attempt = 0; attempt < 2; attempt++) {
          popupDismissed = await this.page.evaluate(() => {
            const searchAndClick = (root) => {
              const elements = root.querySelectorAll('*');
              for (const el of elements) {
                // If element has a shadow root, search inside it
                if (el.shadowRoot) {
                  if (searchAndClick(el.shadowRoot)) return true;
                }
                
                // Check if it's a clickable element
                const tag = el.tagName.toUpperCase();
                const role = el.getAttribute('role');
                if (tag === 'BUTTON' || tag === 'SPAN' || tag === 'DIV' || role === 'button') {
                  const text = (el.textContent || '').trim();
                  // Check for Exact Text Matches (only click Hủy to avoid triggering Google Drive picker)
                  if (text === 'Hủy' || text === 'Huỷ') {
                    // Make sure element is visible
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      el.click();
                      return true;
                    }
                  }
                }
              }
              return false;
            };

            // Search main document
            let clicked = searchAndClick(document);
            
            // Also try to search any accessible iframes just in case
            if (!clicked) {
              const iframes = document.querySelectorAll('iframe');
              for (const iframe of iframes) {
                try {
                  if (iframe.contentDocument && searchAndClick(iframe.contentDocument)) {
                    clicked = true;
                    break;
                  }
                } catch (e) {}
              }
            }
            return clicked;
          });

          if (popupDismissed) {
            log.debug('Successfully dismissed popup via DOM injection!');
            await this._randomDelay(500, 1000);
            break;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        if (popupDismissed) {
           // Click outside to dismiss any leftover backdrops
           await this.page.mouse.click(10, 10);
           await this._randomDelay(500, 1000);
           
           log.debug('Re-clicking attachment button after dismissing popup...');
           await this.page.waitForSelector(SELECTORS.ATTACHMENT_BUTTON, { timeout: 10000 });
           await this.page.click(SELECTORS.ATTACHMENT_BUTTON);
           await this._randomDelay(1500, 2500);
        }

      } catch (e) {
        log.warn('Attachment button not found, trying alternative approaches', { error: e.message });
        await this.screenshot('upload_attach_btn_fail');
      }

      // Bước 3: Sau khi click nút +, có thể xuất hiện menu popup
      // Sử dụng page.evaluate để tìm chính xác menu item tải file từ máy tính
      try {
        log.debug('Looking for local file upload menu item via DOM...');
        const clickedMenu = await this.page.evaluate(() => {
          const elements = document.querySelectorAll('*');
          for (const el of elements) {
            // Must be a button, div, or menuitem
            const tag = el.tagName.toUpperCase();
            const role = el.getAttribute('role');
            if (tag === 'BUTTON' || role === 'menuitem' || tag === 'LI') {
              const text = (el.textContent || '').trim().toLowerCase();
              // Keywords for local file upload in Vietnamese and English
              if ((text.includes('tải') && text.includes('tệp')) || 
                  text.includes('thiết bị') || 
                  text.includes('máy tính') || 
                  (text.includes('upload') && text.includes('file'))) {
                
                // Exclude Google Drive or Workspace
                if (!text.includes('drive') && !text.includes('workspace')) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    el.click();
                    return true;
                  }
                }
              }
            }
          }
          return false;
        });
        
        if (clickedMenu) {
          log.debug('Local upload file menu item clicked via JS');
          await this._randomDelay(1000, 2000);
        } else {
          // Fallback to old selector if JS fails
          const uploadMenuItem = await this.page.$(SELECTORS.UPLOAD_FILE_MENU_ITEM);
          if (uploadMenuItem) {
            await uploadMenuItem.click();
            log.debug('Upload file menu item clicked via selector');
            await this._randomDelay(1000, 2000);
          }
        }
      } catch (e) {
        log.debug('No upload menu item found (may not be needed)');
      }

      // Bước 4: Chờ input[type="file"] xuất hiện
      try {
        await this.page.waitForSelector(SELECTORS.FILE_INPUT, { state: 'attached', timeout: 3000 });
        log.debug('File input appeared in DOM');
      } catch (e) {
        // Fallback: Tìm bất kỳ input[type="file"] nào, kể cả ẩn
        log.debug('Waiting for file input failed, trying to find hidden inputs...');
        const hiddenInputs = await this.page.$$eval('input', els => 
          els.filter(el => el.type === 'file').map(el => ({
            id: el.id, 
            className: el.className,
            accept: el.accept
          }))
        );
        log.debug('Hidden file inputs found:', { count: hiddenInputs.length, inputs: hiddenInputs });
        
        if (hiddenInputs.length === 0) {
          await this.screenshot('upload_no_file_input');
          throw new Error('No file input found in DOM after clicking attachment button');
        }
      }
    }

    // Bước 5: Inject file vào input element
    // Playwright's setInputFiles hoạt động với cả hidden input
    await this.page.setInputFiles(SELECTORS.FILE_INPUT, absolutePath);
    log.info('File injected into DOM, continuing immediately to typing prompt...');
  }

  // ──────────────────────────────────
  // Chat Interaction
  // ──────────────────────────────────

  /**
   * Gửi prompt text vào Gemini chat
   * 
   * @param {string} promptText - Nội dung prompt
   * @returns {Promise<string>} Response text từ Gemini
   */
  async sendPrompt(promptText) {
    if (!promptText || promptText.trim().length === 0) {
      throw new Error('Prompt text is empty');
    }
    
    promptText = promptText.trim();

    log.info('Sending prompt...', { length: promptText.length });

    // Chờ UI ổn định (rất quan trọng khi gửi prompt 2, 3 sau khi response trước vừa xong)
    await this._randomDelay(2500, 4000);

    // Tìm chat input
    await this.page.waitForSelector(SELECTORS.CHAT_INPUT, { timeout: 15000 });
    
    const chatInput = await this.page.$(SELECTORS.CHAT_INPUT);
    try {
      await chatInput.click({ force: true, timeout: 3000 });
    } catch (e) {
      log.debug('Forced click on chatInput failed, trying to focus', { error: e.message });
      await chatInput.focus();
    }
    await this._randomDelay(300, 600);

    // Gõ text với tốc độ human-like
    // Nếu prompt quá dài (>500 chars), paste thay vì gõ từng ký tự
    if (promptText.length > 500) {
      await this._pasteText(promptText);
    } else {
      await this._humanType(promptText);
    }

    await this._randomDelay(800, 1500);

    // Click Send button and verify it was sent
    await this._clickSendButton();

    // Chờ response hoàn tất
    const response = await this._waitForResponse();
    
    log.info('Response received', { length: response.length });
    return response;
  }

  /**
   * Paste text vào chatbox (cho prompt dài)
   * Gemini dùng Quill editor (contenteditable div.ql-editor)
   * @private
   */
  async _pasteText(text) {
    log.debug('Pasting text (long prompt)...', { length: text.length });

    // Focus vào chat input
    const chatInput = await this.page.$(SELECTORS.CHAT_INPUT);
    if (chatInput) {
      try {
        await chatInput.click({ force: true, timeout: 3000 });
      } catch(e) {
        await chatInput.focus();
      }
      await this._randomDelay(300, 500);
    }

    // Dùng Playwright fill() cho contenteditable div (nhanh và an toàn hơn innerHTML)
    try {
      await this.page.locator(SELECTORS.CHAT_INPUT).fill(text);
      await this._randomDelay(800, 1200);
    } catch (e) {
      log.warn('locator.fill failed, falling back to keyboard type', { error: e.message });
      try {
        await this.page.locator(SELECTORS.CHAT_INPUT).click({ force: true, timeout: 3000 });
      } catch (e) {}
      await this.page.keyboard.type(text, { delay: 1 });
      await this._randomDelay(800, 1200);
    }
  }

  /**
   * Gõ text với tốc độ ngẫu nhiên giả lập người thật
   * @private
   */
  async _humanType(text) {
    const minDelay = parseInt(process.env.TYPING_DELAY_MIN) || 30;
    const maxDelay = parseInt(process.env.TYPING_DELAY_MAX) || 80;

    for (const char of text) {
      await this.page.keyboard.type(char, {
        delay: this._randomInt(minDelay, maxDelay),
      });
    }
  }

  /**
   * Click nút Send (hoặc nhấn Enter)
   * @private
   */
  async _clickSendButton() {
    log.info('Clicking Send button (waiting patiently if uploading)...');

    let sent = false;
    let screenshotTaken = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      // Cách 1: Playwright click Send button
      try {
        const sendBtn = await this.page.$(SELECTORS.SEND_BUTTON);
        if (sendBtn) {
          await sendBtn.click({ timeout: 1000 });
        }
      } catch (e) {}
      
      await this._randomDelay(1000, 1500);

      // Cách 2: Nhấn Enter
      try {
        const chatInput = await this.page.$(SELECTORS.CHAT_INPUT);
        if (chatInput) {
          try { await chatInput.click({ force: true, timeout: 1000 }); } catch (e) { await chatInput.focus(); }
        }
        // XÓA NÚT ESCAPE Ở ĐÂY VÌ ESC SẼ HỦY UPLOAD VIDEO CỦA GEMINI!
        await this._randomDelay(300, 500);
        await this.page.keyboard.press('Enter');
      } catch (e) {}

      await this._randomDelay(1500, 2000);

      // Cách 3: JS fallback CHỈ DÙNG SAU 45s chờ đợi
      if (attempt > 20) {
        try {
          await this.page.evaluate(() => {
            const els = document.querySelectorAll('button, [role="button"], .send-button');
            for (const el of els) {
              const aria = (el.getAttribute('aria-label') || '').toLowerCase();
              const tooltip = (el.title || '').toLowerCase();
              if (aria.includes('gửi') || aria.includes('send') || tooltip.includes('send') || tooltip.includes('gửi')) {
                el.click();
              }
            }
          });
        } catch (e) {}
      }

      // Kiểm tra chatbox đã trống chưa
      try {
        const inputContent = await this.page.$eval(SELECTORS.CHAT_INPUT, el => el.innerText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim());
        if (inputContent.length === 0) {
          sent = true;
          log.info('Sent successfully!', { attempt });
          break;
        }
      } catch (e) {
        sent = true;
        break;
      }

      // Screenshot debug sau 20 attempts (~60s) 
      if (attempt === 20 && !screenshotTaken) {
        screenshotTaken = true;
        log.warn('Send button not responding after 20 attempts, taking debug screenshot...');
        try {
          await this.screenshot('send_stuck_debug');
        } catch (e) {}
      }

      // Detect Gemini error/warning trên trang (tránh chờ vô hạn)
      if (attempt > 15) {
        try {
          const pageError = await this.page.evaluate(() => {
            const errorEls = document.querySelectorAll('[class*="error"], [class*="snackbar"], [class*="alert"]');
            for (const el of errorEls) {
              const text = (el.innerText || '').trim();
              if (text.length > 10 && text.length < 300) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  return text;
                }
              }
            }
            return '';
          });
          if (pageError.length > 0) {
            log.warn('Gemini error/warning detected while waiting to send', { error: pageError.substring(0, 200) });
          }
        } catch (e) {}
      }

      if (attempt % 5 === 0) {
        log.info('Still waiting for send to be accepted (video might be uploading)...', { attempt });
      }
    }

    if (!sent) {
      log.warn('Could not confirm if message was sent after ~90s, input box is not empty');
      await this.screenshot('send_failed_final');
      throw new Error('Failed to send message: Input box did not clear');
    }
  }

  /**
   * Chờ Gemini trả lời xong và scrape response text
   * Sử dụng kết hợp: selector check + DOM text change detection
   * @private
   * @returns {Promise<string>} Response text
   */
  async _waitForResponse(timeout = 180000) {
    log.debug('Waiting for Gemini response...');
    
    const startTime = Date.now();
    let initialResponseCount = 0;
    
    try {
      const responses = await this.page.$$(SELECTORS.RESPONSE_CONTAINER);
      initialResponseCount = responses.length;
    } catch (e) {}

    // Lấy baseline DOM text length để detect thay đổi
    let baselineTextLength = 0;
    try {
      baselineTextLength = await this.page.evaluate(() => document.body.innerText.length);
    } catch (e) {}

    // Chờ response bắt đầu — tăng thời gian chờ ban đầu lên 8-12s 
    // vì Gemini cần thời gian xử lý video lớn (59MB)
    await this._randomDelay(8000, 12000);

    // Polling: chờ cho đến khi response ổn định
    let lastResponseLength = 0;
    let stableCount = 0;
    const stableThreshold = 3; // Response phải ổn định 3 lần check liên tiếp
    let lastDomTextLength = baselineTextLength;

    while (Date.now() - startTime < timeout) {
      try {
        // Check 1: Selector-based loading detection
        let isLoading = false;
        let isStopBtnVisible = false;
        
        try {
          isLoading = await this.page.isVisible(SELECTORS.RESPONSE_LOADING);
          isStopBtnVisible = await this.page.isVisible(SELECTORS.STOP_BUTTON);
        } catch (e) {}

        // Check 2: DOM text change detection (backup khi selectors fail)
        let currentDomTextLength = lastDomTextLength;
        try {
          currentDomTextLength = await this.page.evaluate(() => document.body.innerText.length);
        } catch (e) {}
        const isDomChanging = Math.abs(currentDomTextLength - lastDomTextLength) > 20;
        lastDomTextLength = currentDomTextLength;

        // Gemini đang generate nếu BẤT KỲ indicator nào cho thấy hoạt động
        const isStillGenerating = isLoading || isStopBtnVisible || isDomChanging;

        if (!isStillGenerating) {
          // Verify a new response was actually generated by checking count
          let currentCount = initialResponseCount;
          try {
            const responses = await this.page.$$(SELECTORS.RESPONSE_CONTAINER);
            currentCount = responses.length;
          } catch(e) {}
          
          // NẾU CHƯA CÓ RESPONSE MỚI: Bắt buộc phải chờ!
          if (currentCount <= initialResponseCount) {
            if (Date.now() - startTime < 60000) {
              log.debug('Waiting for NEW response block to appear...', { currentCount, initialResponseCount });
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            } else {
              // Nếu đã quá 60s mà vẫn chưa có response block mới, có thể response được update thẳng vào block cũ
              // Hoặc request bị lỗi. Ta cho phép tiếp tục để check text.
              log.debug('Timeout waiting for new block, checking text anyway...');
            }
          }

          // Lấy response text hiện tại
          const currentResponse = await this._extractLastResponse();
          
          if (currentResponse && currentResponse.length > 0) {
            if (currentResponse.length === lastResponseLength) {
              stableCount++;
              if (stableCount >= stableThreshold) {
                return currentResponse;
              }
            } else {
              stableCount = 0;
              lastResponseLength = currentResponse.length;
            }
          }
        } else {
          stableCount = 0;
        }

        // Check 3: Detect Gemini error messages
        try {
          const errorText = await this.page.evaluate(() => {
            const errorElements = document.querySelectorAll('[class*="error"], [class*="warning"], .error-message');
            for (const el of errorElements) {
              const text = el.innerText.trim();
              if (text.length > 20 && text.length < 500) {
                return text;
              }
            }
            return '';
          });
          if (errorText.length > 0) {
            log.warn('Gemini error detected on page', { errorText: errorText.substring(0, 200) });
          }
        } catch (e) {}

      } catch (e) {
        log.debug('Response check error (retrying)', { error: e.message });
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Timeout - chụp screenshot debug rồi cố gắng lấy response hiện có
    log.warn('Response timeout, extracting current response');
    try {
      await this.screenshot('response_timeout_debug');
    } catch (e) {}
    return await this._extractLastResponse() || '';
  }

  /**
   * Scrape response text cuối cùng từ DOM
   * Dùng page.evaluate() để quét sâu vào DOM, kể cả shadow DOM
   * Thử nhiều chiến lược khác nhau vì Gemini DOM thay đổi thường xuyên
   * @private
   */
  async _extractLastResponse() {
    try {
      // === Chiến lược 1: Dùng page.evaluate() quét DOM trực tiếp (mạnh nhất) ===
      const responseFromJS = await this.page.evaluate(() => {
        // Chỉ tìm trong các tag/class dành riêng cho model response (tránh user prompt)
        const modelContainers = document.querySelectorAll('model-response, .model-response-text, [data-message-author="model"], message-content:not(:has(user-query))');
        
        if (modelContainers.length > 0) {
          // Lấy block cuối cùng (response mới nhất)
          const lastEl = modelContainers[modelContainers.length - 1];
          const markdownEl = lastEl.querySelector('[class*="markdown"]') || lastEl;
          const text = markdownEl.innerText.trim();
          
          // Trả về text của block cuối, bất kể độ dài.
          // Nếu đang generate thì text có thể trống, ta cần nó trống để tiếp tục chờ.
          return text;
        }
        return '';
      });

      if (responseFromJS && responseFromJS.length > 0) {
        return responseFromJS;
      }

      // === Chiến lược 2: CSS Selectors qua Playwright API (fallback) ===
      let responses = await this.page.$$(SELECTORS.RESPONSE_CONTAINER);
      
      if (responses.length > 0) {
        try {
          const lastResponse = responses[responses.length - 1];
          const text = await lastResponse.innerText();
          return text.trim();
        } catch (e) {}
      }

      log.debug('No response elements found by any strategy');
      return '';
    } catch (error) {
      log.debug('Error extracting response', { error: error.message });
      return '';
    }
  }

  // ──────────────────────────────────
  // Utility Methods
  // ──────────────────────────────────

  /**
   * Delay ngẫu nhiên để giả lập hành vi người dùng
   * @private
   */
  async _randomDelay(min, max) {
    const delay = this._randomInt(
      min || parseInt(process.env.ACTION_DELAY_MIN) || 1000,
      max || parseInt(process.env.ACTION_DELAY_MAX) || 3000
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Random integer trong khoảng [min, max]
   * @private
   */
  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Chụp screenshot (debug/troubleshooting)
   * @param {string} name - Tên file screenshot
   */
  async screenshot(name) {
    if (!this.page) return;
    const screenshotPath = path.join(process.cwd(), 'logs', `${name}_${Date.now()}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    log.info('Screenshot saved', { path: screenshotPath });
  }
}

module.exports = BrowserAgent;
