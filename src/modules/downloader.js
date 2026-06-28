/**
 * Facebook Reel Video Downloader Module
 * 
 * Sử dụng yt-dlp (CLI) để tải video MP4 từ Facebook Reel.
 * - Validate URL format
 * - Spawn yt-dlp process  
 * - Retry 2 lần khi thất bại
 * - Garbage collection: cleanup file tạm
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('Downloader');

/**
 * Validate URL có phải Facebook Reel hợp lệ không
 * @param {string} url 
 * @returns {boolean}
 */
function isValidVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const patterns = [
    // Facebook
    /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/reel\//i,
    /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/watch\//i,
    /^https?:\/\/(www\.|m\.)?fb\.watch\//i,
    /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/.*\/videos\//i,
    /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/share\/r\//i,
    // YouTube
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i,
    /^https?:\/\/youtu\.be\//i,
  ];

  return patterns.some(pattern => pattern.test(url));
}

/**
 * Đảm bảo thư mục temp_videos tồn tại
 * @returns {string} Đường dẫn thư mục
 */
function ensureTempDir() {
  const tempDir = path.resolve(process.cwd(), process.env.TEMP_VIDEO_DIR || 'temp_videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    log.info('Created temp directory', { path: tempDir });
  }
  return tempDir;
}

/**
 * Tải video từ Facebook Reel bằng yt-dlp
 * 
 * @param {string} url - URL Facebook Reel
 * @param {object} [options] - Tùy chọn
 * @param {number} [options.timeout=120000] - Timeout (ms)
 * @param {number} [options.maxRetries=2] - Số lần retry
 * @returns {Promise<{filePath: string, filename: string}>} Thông tin file đã tải
 */
async function downloadVideo(url, options = {}) {
  const timeout = options.timeout || parseInt(process.env.DOWNLOAD_TIMEOUT) || 120000;
  const maxRetries = options.maxRetries || 2;
  
  // Validate URL
  if (!isValidVideoUrl(url)) {
    throw new Error(`Invalid Video URL: ${url}`);
  }

  const tempDir = ensureTempDir();
  const fileId = uuidv4().slice(0, 8);
  const outputTemplate = path.join(tempDir, `reel_${fileId}.%(ext)s`);
  const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`Download attempt ${attempt}/${maxRetries}`, { url, fileId });
      
      const filePath = await _executeYtdlp(ytdlpPath, url, outputTemplate, timeout);
      
      // Verify file tồn tại và có kích thước > 0
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        throw new Error('Downloaded file is empty (0 bytes)');
      }

      log.info('Download completed', { 
        filePath, 
        size: `${(stats.size / 1024 / 1024).toFixed(2)} MB` 
      });

      // Cảnh báo nếu file quá lớn (có thể gây chậm upload lên Gemini)
      if (stats.size > 40 * 1024 * 1024) {
        log.warn('Video file is large (>40MB), Gemini upload may be slow', {
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`
        });
      }

      return {
        filePath,
        filename: path.basename(filePath),
        sizeBytes: stats.size,
      };

    } catch (error) {
      lastError = error;
      log.warn(`Download attempt ${attempt} failed`, { 
        error: error.message, 
        url 
      });

      if (attempt < maxRetries) {
        const delay = attempt * 3000; // backoff: 3s, 6s
        log.info(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to download after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Chạy yt-dlp process
 * @private
 */
function _executeYtdlp(ytdlpPath, url, outputTemplate, timeout) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--merge-output-format', 'mp4',
      // Ưu tiên video nhỏ hơn 50MB, fallback 720p, rồi best available
      '-f', 'best[ext=mp4][filesize<50M]/best[ext=mp4][height<=720]/best[ext=mp4]/best',
      '-o', outputTemplate,
      '--socket-timeout', '30',
      '--retries', '3',
      '--no-check-certificates',
      url,
    ];

    log.debug('Spawning yt-dlp', { path: ytdlpPath, args: args.join(' ') });

    // On Windows, spawn without shell to avoid DEP0190 deprecation.
    // Use Python to run yt-dlp to bypass AppLocker restrictions on the .exe
    const proc = spawn('C:\\Users\\egois\\AppData\\Local\\Programs\\Python\\Python310\\python.exe', ['-m', 'yt_dlp', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      stdout += line + '\n';
      // Log download progress
      if (line.includes('[download]')) {
        log.debug(line);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Timeout handler
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`yt-dlp timeout after ${timeout / 1000}s`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        log.error('yt-dlp exited with error', { code, stderr: stderr.trim() });
        return reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim()}`));
      }

      // Tìm file output (yt-dlp tự thêm extension)
      const tempDir = path.dirname(outputTemplate);
      const filePrefix = path.basename(outputTemplate).replace('.%(ext)s', '');
      
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith(filePrefix));
      
      if (files.length === 0) {
        return reject(new Error('yt-dlp completed but no output file found'));
      }

      const outputPath = path.join(tempDir, files[0]);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(`yt-dlp not found at "${ytdlpPath}". Install: pip install yt-dlp`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Xóa file video tạm (Garbage Collection)
 * @param {string} filePath - Đường dẫn file cần xóa
 */
function cleanupVideo(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log.info('Cleaned up temp video', { filePath });
    }
  } catch (error) {
    log.warn('Failed to cleanup video file', { filePath, error: error.message });
  }
}

module.exports = {
  downloadVideo,
  cleanupVideo,
  isValidVideoUrl,
};
