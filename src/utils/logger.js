/**
 * Logger Module
 * 
 * Winston-based structured logging với format:
 * [timestamp] [level] [module] message
 * 
 * Output: console + file logs/app.log
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục logs tồn tại
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format cho console (có màu)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, module, message, ...meta }) => {
    const mod = module ? `[${module}]` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${mod} ${message}${extra}`;
  })
);

// Format cho file (không màu, JSON-friendly)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, module, message, ...meta }) => {
    const mod = module ? `[${module}]` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${mod} ${message}${extra}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport với rotation
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    // Error-only file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      format: fileFormat,
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

/**
 * Tạo child logger cho module cụ thể
 * @param {string} moduleName - Tên module (vd: 'Downloader', 'BrowserAgent')
 * @returns {winston.Logger} Child logger
 * 
 * @example
 * const log = require('./utils/logger').createModuleLogger('Downloader');
 * log.info('Downloading video...', { url: '...' });
 */
function createModuleLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = {
  logger,
  createModuleLogger,
};
