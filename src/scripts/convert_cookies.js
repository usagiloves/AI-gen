/**
 * Convert Netscape Cookie File (.txt) → Playwright Storage State (.json)
 * 
 * Usage: node src/scripts/convert_cookies.js
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.resolve(process.cwd(), 'cookies/gemini.google.com_cookies.txt');
const OUTPUT = path.resolve(process.cwd(), 'cookies/state.json');

function parseNetscapeCookies(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => 
    line.trim() && !line.startsWith('#')
  );

  const cookies = lines.map(line => {
    const parts = line.split('\t');
    if (parts.length < 7) return null;

    const [domain, , path, secure, expires, name, value] = parts;

    return {
      name: name.trim(),
      value: value.trim(),
      domain: domain.trim(),
      path: path.trim(),
      expires: parseInt(expires) || -1,
      httpOnly: true,
      secure: secure.trim() === 'TRUE',
      sameSite: 'Lax',
    };
  }).filter(Boolean);

  return cookies;
}

function convertToStorageState(cookies) {
  return {
    cookies,
    origins: [],
  };
}

// Main
try {
  console.log(`📖 Reading: ${INPUT}`);
  const cookies = parseNetscapeCookies(INPUT);
  console.log(`🍪 Parsed ${cookies.length} cookies`);

  const storageState = convertToStorageState(cookies);

  fs.writeFileSync(OUTPUT, JSON.stringify(storageState, null, 2), 'utf-8');
  console.log(`✅ Saved: ${OUTPUT}`);
  console.log('');
  console.log('Bạn có thể chạy "npm start" để khởi động pipeline.');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
