/**
 * In-Memory Task Store
 * 
 * Thay thế Redis cho chế độ single-task (1 task/lần).
 * Lưu trữ task state trong Map, mất khi restart server.
 * 
 * Task lifecycle: QUEUED → DOWNLOADING → ANALYZING → GENERATING → COMPLETED | FAILED
 */

const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('TaskStore');

/** @type {Map<string, TaskData>} */
const tasks = new Map();

/**
 * @typedef {Object} TaskData
 * @property {string} taskId
 * @property {string} url - Facebook Reel URL
 * @property {string} [webhookUrl] - Optional callback URL
 * @property {'QUEUED'|'DOWNLOADING'|'ANALYZING'|'GENERATING'|'COMPLETED'|'FAILED'} status
 * @property {string|null} videoSummary - Phase 1 output
 * @property {string|null} finalScript - Phase 2 output
 * @property {string|null} error - Error message if FAILED
 * @property {number} createdAt - Timestamp
 * @property {number|null} completedAt - Timestamp
 */

/**
 * Tạo task mới
 * @param {string} taskId 
 * @param {string} url 
 * @param {string} [webhookUrl]
 * @returns {TaskData}
 */
function createTask(taskId, url, webhookUrl = null) {
  const task = {
    taskId,
    url,
    webhookUrl,
    status: 'QUEUED',
    videoSummary: null,
    finalScript: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
  };

  tasks.set(taskId, task);
  log.info('Task created', { taskId, url });

  // Emit event to all connected clients
  try {
    const { emitTaskEvent } = require('../sockets');
    emitTaskEvent('task:created', task);
    emitTaskEvent('task:queued', task);
  } catch (e) {
    log.error('Failed to emit task event', { error: e.message });
  }

  return task;
}

/**
 * Lấy thông tin task
 * @param {string} taskId 
 * @returns {TaskData|null}
 */
function getTask(taskId) {
  return tasks.get(taskId) || null;
}

const { emitTaskEvent } = require('../sockets');

/**
 * Cập nhật status của task
 * @param {string} taskId 
 * @param {'QUEUED'|'DOWNLOADING'|'ANALYZING'|'GENERATING'|'COMPLETED'|'FAILED'} status 
 * @param {object} [data] - Additional data to merge
 */
function updateTask(taskId, status, data = {}) {
  const task = tasks.get(taskId);
  if (!task) {
    log.warn('Task not found for update', { taskId });
    return;
  }

  task.status = status;
  Object.assign(task, data);

  if (status === 'COMPLETED' || status === 'FAILED') {
    task.completedAt = Date.now();
  }

  tasks.set(taskId, task);
  log.info('Task updated', { taskId, status });

  // Emit event to all connected clients
  try {
    emitTaskEvent('task:updated', task);
    emitTaskEvent(`task:${status.toLowerCase()}`, task);
  } catch (e) {
    log.error('Failed to emit task event', { error: e.message });
  }
}

/**
 * Lấy task tiếp theo trong hàng đợi (FIFO)
 * @returns {TaskData|null}
 */
function dequeueTask() {
  for (const [, task] of tasks) {
    if (task.status === 'QUEUED') {
      return task;
    }
  }
  return null;
}

/**
 * Kiểm tra có task nào đang xử lý không
 * @returns {boolean}
 */
function hasActiveTask() {
  for (const [, task] of tasks) {
    if (['DOWNLOADING', 'ANALYZING', 'GENERATING'].includes(task.status)) {
      return true;
    }
  }
  return false;
}

/**
 * Lấy tất cả tasks (cho debug)
 * @returns {TaskData[]}
 */
function getAllTasks() {
  return Array.from(tasks.values());
}

/**
 * Dọn tasks cũ (> 1 giờ)
 */
function cleanupOldTasks() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let cleaned = 0;

  for (const [taskId, task] of tasks) {
    if (task.completedAt && task.completedAt < oneHourAgo) {
      tasks.delete(taskId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.info(`Cleaned up ${cleaned} old tasks`);
  }
}

module.exports = {
  createTask,
  getTask,
  updateTask,
  dequeueTask,
  hasActiveTask,
  getAllTasks,
  cleanupOldTasks,
};
