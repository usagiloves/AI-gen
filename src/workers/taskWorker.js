/**
 * Task Worker Module
 * 
 * Background worker xử lý pipeline tuần tự (1 task/lần):
 * QUEUED → DOWNLOADING → ANALYZING → GENERATING → COMPLETED
 * 
 * Polling loop kiểm tra queue mỗi 5 giây.
 * Auto-cleanup video file khi xong (thành công hoặc thất bại).
 */

const { createModuleLogger } = require('../utils/logger');
const { downloadVideo, cleanupVideo } = require('../modules/downloader');
const BrowserAgent = require('../modules/browser_agent');
const { executePipeline } = require('../modules/prompt_engine');
const taskStore = require('./taskStore');

const log = createModuleLogger('TaskWorker');

let isRunning = false;
let pollInterval = null;

/**
 * Khởi chạy worker polling loop
 * @param {number} [intervalMs=5000] - Khoảng thời gian polling (ms)
 */
function startWorker(intervalMs = 5000) {
  if (isRunning) {
    log.warn('Worker already running');
    return;
  }

  isRunning = true;
  log.info('Task Worker started', { pollInterval: `${intervalMs}ms` });

  // Polling loop
  pollInterval = setInterval(async () => {
    try {
      // Nếu đang xử lý task khác, skip
      if (taskStore.hasActiveTask()) {
        return;
      }

      // Lấy task tiếp theo từ queue
      const task = taskStore.dequeueTask();
      if (!task) {
        return; // Queue rỗng
      }

      // Xử lý task
      await processTask(task);

      // Cleanup tasks cũ
      taskStore.cleanupOldTasks();
    } catch (error) {
      log.error('Worker polling error', { error: error.message });
    }
  }, intervalMs);
}

/**
 * Dừng worker
 */
function stopWorker() {
  isRunning = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  log.info('Task Worker stopped');
}

/**
 * Xử lý một task hoàn chỉnh: Download → Phase 1 → Phase 2
 * @param {import('./taskStore').TaskData} task 
 */
async function processTask(task) {
  const { taskId, url, webhookUrl } = task;
  let videoPath = null;
  const agent = new BrowserAgent();

  log.info('════════════════════════════════════════');
  log.info(`Processing task: ${taskId}`, { url });
  log.info('════════════════════════════════════════');

  try {
    // ── Step 1: Download Video ──
    taskStore.updateTask(taskId, 'DOWNLOADING');
    log.info('[Step 1/4] Downloading video...');

    const downloadResult = await downloadVideo(url);
    videoPath = downloadResult.filePath;

    log.info('[Step 1/4] Download complete', { 
      file: downloadResult.filename,
      size: `${(downloadResult.sizeBytes / 1024 / 1024).toFixed(2)} MB`
    });

    // ── Step 2: Initialize Browser ──
    taskStore.updateTask(taskId, 'ANALYZING');
    log.info('[Step 2/4] Initializing browser agent...');

    await agent.initialize();

    // ── Step 3: Execute Pipeline (Phase 1 + Phase 2) ──
    log.info('[Step 3/4] Running prompt pipeline...');
    
    // Phase 1: Video Analysis
    const { videoSummary, finalScript } = await executePipeline(agent, videoPath);

    // ── Step 4: Complete ──
    taskStore.updateTask(taskId, 'COMPLETED', {
      videoSummary,
      finalScript,
    });

    log.info('[Step 4/4] Task completed successfully!', { taskId });

    // Gọi webhook nếu có
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        taskId,
        status: 'COMPLETED',
        videoSummary,
        finalScript,
      });
    }

  } catch (error) {
    log.error('Task failed', { taskId, error: error.message, stack: error.stack });

    taskStore.updateTask(taskId, 'FAILED', {
      error: error.message,
    });

    // Screenshot để debug
    try {
      await agent.screenshot(`error_${taskId}`);
    } catch (_) {}

    // Webhook thông báo lỗi
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        taskId,
        status: 'FAILED',
        error: error.message,
      });
    }

  } finally {
    // ── Cleanup: LUÔN xóa video và đóng browser ──
    cleanupVideo(videoPath);
    await agent.close();
    
    log.info('Task cleanup done', { taskId });
  }
}

/**
 * Gửi kết quả qua webhook
 * @param {string} webhookUrl 
 * @param {object} payload 
 */
async function sendWebhook(webhookUrl, payload) {
  try {
    log.info('Sending webhook...', { url: webhookUrl });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    log.info('Webhook sent', { 
      url: webhookUrl, 
      status: response.status 
    });
  } catch (error) {
    log.warn('Webhook failed (non-blocking)', { 
      url: webhookUrl, 
      error: error.message 
    });
  }
}

module.exports = {
  startWorker,
  stopWorker,
  processTask,
};
