const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('LoginAgent');

const COOKIE_DIR = path.resolve(process.cwd(), 'cookies');
const GEMINI_URL = process.env.GEMINI_URL || 'https://gemini.google.com/app';

let loginBrowserContext = null;

/**
 * Start the browser for manual login
 */
async function startLogin() {
  if (loginBrowserContext) {
    throw new Error('Login browser is already running');
  }

  if (!fs.existsSync(COOKIE_DIR)) {
    fs.mkdirSync(COOKIE_DIR, { recursive: true });
    log.info(`Created directory: ${COOKIE_DIR}`);
  }

  const userDataDir = path.resolve(process.cwd(), 'cookies/browser_profile');
  loginBrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Must be false to allow user to login manually
    viewport: null,
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

  const page = loginBrowserContext.pages().length > 0 ? loginBrowserContext.pages()[0] : await loginBrowserContext.newPage();

  loginBrowserContext.on('close', () => {
    log.info('User manually closed the login browser.');
    loginBrowserContext = null;
  });

  log.info(`Opening: ${GEMINI_URL}`);
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });

  // Do not close automatically. Wait for completeLogin() to be called.
  return { status: 'started', message: 'Browser opened. Please login.' };
}

/**
 * Close the browser after login is complete
 */
async function completeLogin() {
  if (!loginBrowserContext) {
    throw new Error('Login browser is not running');
  }

  await loginBrowserContext.close();
  loginBrowserContext = null;
  log.info('Login browser closed. Profile automatically saved.');

  return { status: 'completed', message: 'Profile saved successfully' };
}

module.exports = {
  startLogin,
  completeLogin
};
