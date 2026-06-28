/**
 * Main Entry Point
 * 
 * Khởi chạy cả API Server và Task Worker trong cùng 1 process.
 * (Phù hợp cho chế độ single-task trên Windows)
 * 
 * Usage:
 *   npm start        → Chạy cả API + Worker
 *   npm run dev      → Chạy với nodemon (auto-reload)
 *   npm run login    → Đăng nhập Google (lần đầu)
 */

require('dotenv').config();

const app = require('./api/server');
const { startWorker, stopWorker } = require('./workers/taskWorker');
const { createModuleLogger } = require('./utils/logger');

const log = createModuleLogger('Main');

const PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || 'localhost';

const { initSocket } = require('./sockets');

// ──────────────────────────────────
// Start Server
// ──────────────────────────────────

const server = app.listen(PORT, HOST, () => {
  log.info('═══════════════════════════════════════════════');
  log.info('  🎬 AI Reel Script Generator Pipeline');
  log.info('  Zero-API Browser Agent');
  log.info('═══════════════════════════════════════════════');
  log.info(`  API Server:  http://${HOST}:${PORT}`);
  log.info(`  Health:      http://${HOST}:${PORT}/health`);
  log.info('═══════════════════════════════════════════════');
  log.info('');
  log.info('Endpoints:');
  log.info(`  POST http://${HOST}:${PORT}/api/v1/generate-script`);
  log.info(`  GET  http://${HOST}:${PORT}/api/v1/task/:task_id`);
  // Init Socket.IO
  initSocket(server);

  // Thêm Transport để đẩy Log trực tiếp qua Socket.IO
  const winston = require('winston');
  const Transport = require('winston-transport');
  const { getIo } = require('./sockets');

  class SocketTransport extends Transport {
    constructor(opts) {
      super(opts);
    }
    log(info, callback) {
      setImmediate(() => {
        try {
          const io = getIo();
          io.emit('system:log', {
            timestamp: info.timestamp || new Date().toISOString(),
            level: info.level,
            module: info.module || 'System',
            message: info.message
          });
        } catch (e) {}
      });
      callback();
    }
  }

  const { logger } = require('./utils/logger');
  logger.add(new SocketTransport());

  // Start background worker
  startWorker(5000);
  log.info('Task Worker started (polling every 5s)');
  log.info('');
  log.info('Ready to receive requests! 🚀');
});

// ──────────────────────────────────
// Graceful Shutdown
// ──────────────────────────────────

function gracefulShutdown(signal) {
  log.info(`\n${signal} received. Shutting down gracefully...`);

  // Stop worker first
  stopWorker();

  // Close HTTP server
  server.close(() => {
    log.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught error handlers
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection', { reason: String(reason) });
});
