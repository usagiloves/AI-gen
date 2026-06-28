/**
 * Google Login Script
 * 
 * Mở cửa sổ Chromium thực tế (headed mode) để đăng nhập Google bằng tay.
 * Sau khi đăng nhập xong, session cookies sẽ được lưu vào cookies/state.json.
 * 
 * Usage: npm run login
 * 
 * LƯU Ý: Chỉ cần chạy 1 lần. Cookie sẽ hết hạn sau ~2 tuần,
 * khi nào hệ thống báo lỗi session expired thì chạy lại.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Load .env nếu có
try { require('dotenv').config(); } catch (_) {}

const COOKIE_DIR = path.resolve(process.cwd(), 'cookies');
const COOKIE_PATH = path.resolve(process.cwd(), process.env.COOKIE_PATH || 'cookies/state.json');
const GEMINI_URL = process.env.GEMINI_URL || 'https://gemini.google.com/app';

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🔐 Google Account Login for Gemini          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Trình duyệt sẽ mở. Hãy đăng nhập Google.  ║');
  console.log('║  Sau khi đăng nhập xong, nhấn Enter ở đây.  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Đảm bảo thư mục cookies tồn tại
  if (!fs.existsSync(COOKIE_DIR)) {
    fs.mkdirSync(COOKIE_DIR, { recursive: true });
    console.log(`📁 Created directory: ${COOKIE_DIR}`);
  }

  // Launch browser persistent context
  const userDataDir = path.resolve(process.cwd(), 'cookies/browser_profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null, // Fullscreen
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Navigate đến Gemini (sẽ redirect về Google Login nếu chưa đăng nhập)
  console.log(`🌐 Opening: ${GEMINI_URL}`);
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('👆 Hãy đăng nhập tài khoản Google trên trình duyệt.');
  console.log('   Đảm bảo bạn đã vào được giao diện Gemini.');
  console.log('');

  // Chờ user đăng nhập và nhấn Enter
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise((resolve) => {
    rl.question('✅ Đã đăng nhập xong? Nhấn [Enter] để lưu cookies... ', () => {
      rl.close();
      resolve();
    });
  });

  // Persistent Context tự động lưu trạng thái, không cần gọi storageState
  console.log('💾 Profile is automatically saved in cookies/browser_profile');

  // Cleanup
  await page.close();
  await context.close();

  console.log('');
  console.log('🎉 Done! Bạn có thể chạy "npm start" để khởi động pipeline.');
  console.log('');
}

main().catch((error) => {
  console.error('❌ Login error:', error.message);
  process.exit(1);
});
