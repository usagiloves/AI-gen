/**
 * API Server
 * 
 * Express.js REST API cho AI Reel Script Pipeline.
 * 
 * Endpoints:
 *   POST /api/v1/generate-script   - Tạo task mới
 *   GET  /api/v1/task/:task_id     - Kiểm tra trạng thái task
 *   GET  /api/v1/tasks             - Liệt kê tất cả tasks
 *   GET  /health                   - Health check
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createModuleLogger } = require('../utils/logger');
const { isValidVideoUrl } = require('../modules/downloader');
const taskStore = require('../workers/taskStore');

const log = createModuleLogger('API');

const app = express();
app.use(express.json());

// ──────────────────────────────────
// Middleware
// ──────────────────────────────────

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
    });
  });
  next();
});

// CORS
const cors = require('cors');
app.use(cors({
  origin: '*', // Allow all origins for dev
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ──────────────────────────────────
// Endpoints
// ──────────────────────────────────

/**
 * POST /api/v1/generate-script
 * Tạo một task mới để xử lý video.
 * 
 * Body: { url: string, webhook_url?: string }
 * Response: { status, message, task_id }
 */
app.post('/api/v1/generate-script', (req, res) => {
  try {
    const { url, webhook_url } = req.body;

    // Validate URL
    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required field: url',
      });
    }

    if (!isValidVideoUrl(url)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Video URL. Expected Facebook Reel or YouTube Shorts URL.',
      });
    }

    // Validate webhook_url nếu có
    if (webhook_url) {
      try {
        new URL(webhook_url);
      } catch {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid webhook_url format',
        });
      }
    }

    // Tạo task
    const taskId = `req_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    taskStore.createTask(taskId, url, webhook_url || null);

    log.info('New task created via API', { taskId, url });

    return res.status(201).json({
      status: 'success',
      message: 'Task added to queue',
      task_id: taskId,
    });

  } catch (error) {
    log.error('Error creating task', { error: error.message });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /api/v1/auth/google-login
 * Start Google login browser
 */
const { startLogin, completeLogin } = require('../modules/login_agent');

app.post('/api/v1/auth/google-login', async (req, res) => {
  try {
    const result = await startLogin();
    return res.json(result);
  } catch (error) {
    log.error('Error starting login', { error: error.message });
    return res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/v1/auth/google-login/done
 * Close Google login browser
 */
app.post('/api/v1/auth/google-login/done', async (req, res) => {
  try {
    const result = await completeLogin();
    return res.json(result);
  } catch (error) {
    log.error('Error completing login', { error: error.message });
    return res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/v1/task/:task_id
 * Kiểm tra trạng thái và lấy kết quả của task.
 */
app.get('/api/v1/task/:task_id', (req, res) => {
  const { task_id } = req.params;

  const task = taskStore.getTask(task_id);

  if (!task) {
    return res.status(404).json({
      status: 'error',
      message: 'Task not found',
      task_id,
    });
  }

  // Format response dựa trên status
  const response = {
    task_id: task.taskId,
    url: task.url,
    status: task.status,
    created_at: new Date(task.createdAt).toISOString(),
  };

  if (task.status === 'COMPLETED') {
    response.result = task.finalScript;
    response.completed_at = new Date(task.completedAt).toISOString();
  }

  if (task.status === 'FAILED') {
    response.error = task.error;
    response.failed_at = new Date(task.completedAt).toISOString();
  }

  return res.json(response);
});

/**
 * GET /api/v1/tasks
 * Liệt kê tất cả tasks (debug/monitoring)
 */
app.get('/api/v1/tasks', (req, res) => {
  const tasks = taskStore.getAllTasks().map(t => ({
    task_id: t.taskId,
    url: t.url,
    status: t.status,
    created_at: new Date(t.createdAt).toISOString(),
    completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
  }));

  return res.json({
    count: tasks.length,
    tasks,
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    has_active_task: taskStore.hasActiveTask(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// Error handler
app.use((err, req, res, _next) => {
  log.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
});

module.exports = app;
