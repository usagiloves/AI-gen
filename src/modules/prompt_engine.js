/**
 * Prompt Engine Module
 * 
 * Quản lý luồng thực thi 2-Phase Prompt Chaining:
 * - Phase 1: Upload video + gửi prompt phân tích → thu được video_summary
 * - Phase 2: Inject summary vào template KB → sinh kịch bản cuối cùng (JSON)
 * 
 * Tự động đọc prompt files từ thư mục cấu hình.
 */

const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('PromptEngine');

/**
 * Đọc tất cả file .txt trong thư mục, sắp xếp theo tên
 * @param {string} dirPath - Đường dẫn thư mục
 * @returns {Array<{filename: string, content: string}>}
 */
function loadPromptFiles(dirPath) {
  const resolvedPath = path.resolve(process.cwd(), dirPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Prompt directory not found: ${resolvedPath}`);
  }

  const files = fs.readdirSync(resolvedPath)
    .filter(f => f.endsWith('.txt'))
    .sort()
    .map(filename => ({
      filename,
      content: fs.readFileSync(path.join(resolvedPath, filename), 'utf-8').trim(),
    }));

  if (files.length === 0) {
    throw new Error(`No .txt files found in: ${resolvedPath}`);
  }

  log.info(`Loaded ${files.length} prompt files from ${dirPath}`, {
    files: files.map(f => f.filename),
  });

  return files;
}

/**
 * Phase 1: Phân tích Video
 * 
 * Upload video lên Gemini, gửi lần lượt các prompt trong prompt_phase_1/,
 * thu thập response cuối cùng làm video_summary.
 * 
 * @param {BrowserAgent} agent - Browser Agent instance (đã initialize)
 * @param {string} videoPath - Đường dẫn file .mp4
 * @returns {Promise<string>} Video summary text
 */
async function executePhase1(agent, videoPath) {
  const promptDir = process.env.PROMPT_PHASE_1_DIR || 'prompt_phase_1';
  
  log.info('=== PHASE 1: Video Analysis START ===', { videoPath });

  // 1. Navigate đến Gemini
  await agent.navigateToGemini();

  // 2. Upload video
  await agent.uploadVideo(videoPath);

  // 3. Đọc và gửi lần lượt các prompt files
  const promptFiles = loadPromptFiles(promptDir);
  let lastResponse = '';

  for (let i = 0; i < promptFiles.length; i++) {
    const { filename, content } = promptFiles[i];
    
    log.info(`Phase 1 - Sending prompt ${i + 1}/${promptFiles.length}`, { filename });
    
    lastResponse = await agent.sendPrompt(content);
    
    log.info(`Phase 1 - Response received for ${filename}`, { 
      responseLength: lastResponse.length 
    });
  }

  if (!lastResponse || lastResponse.trim().length === 0) {
    throw new Error('Phase 1 failed: No response received from Gemini');
  }

  log.info('=== PHASE 1: Video Analysis COMPLETE ===', { 
    summaryLength: lastResponse.length 
  });

  return lastResponse;
}

/**
 * Phase 2: Inject summary + Sinh kịch bản
 * 
 * Đọc file "Prompt KB.txt", tìm từ khóa "CÂU CHUYỆN:" rồi inject 
 * video_summary vào. Gửi lên Gemini trong phiên chat MỚI.
 * 
 * @param {BrowserAgent} agent - Browser Agent instance
 * @param {string} videoSummary - Output từ Phase 1
 * @returns {Promise<string>} Final script (JSON format)
 */
async function executePhase2(agent, videoSummary) {
  const promptDir = process.env.PROMPT_PHASE_2_DIR || 'prompt_phase_2';
  const kbFileName = process.env.PROMPT_KB_FILE || 'Prompt KB.txt';
  
  log.info('=== PHASE 2: Script Generation START ===');

  // 1. Đọc file Prompt KB template
  const kbFilePath = path.resolve(process.cwd(), promptDir, kbFileName);
  
  if (!fs.existsSync(kbFilePath)) {
    throw new Error(`KB prompt file not found: ${kbFilePath}`);
  }

  let kbTemplate = fs.readFileSync(kbFilePath, 'utf-8');
  log.info('Loaded KB template', { file: kbFileName, length: kbTemplate.length });

  // 2. Tìm và inject video summary sau "CÂU CHUYỆN:"
  const injectionKey = 'CÂU CHUYỆN:';
  const keyIndex = kbTemplate.indexOf(injectionKey);

  if (keyIndex === -1) {
    log.warn(`Key "${injectionKey}" not found in KB template. Appending summary at end.`);
    kbTemplate += `\n\n${injectionKey}\n${videoSummary}`;
  } else {
    // Chèn summary ngay sau dòng chứa "CÂU CHUYỆN:"
    const insertPos = keyIndex + injectionKey.length;
    kbTemplate = 
      kbTemplate.slice(0, insertPos) + 
      '\n' + videoSummary + 
      kbTemplate.slice(insertPos);
  }

  log.info('Injected video summary into KB template', { 
    totalLength: kbTemplate.length 
  });

  // 3. Mở phiên chat mới (tách biệt với Phase 1)
  await agent.newChat();

  // 4. Gửi prompt KB đã inject ĐẦU TIÊN
  log.info('Phase 2 - Sending injected KB prompt...');
  let finalScript = await agent.sendPrompt(kbTemplate);

  // 5. Gửi các prompt tiếp theo (nếu có)
  const allPhase2Files = loadPromptFiles(promptDir);
  const otherPrompts = allPhase2Files.filter(f => f.filename !== kbFileName);

  for (const { filename, content } of otherPrompts) {
    log.info(`Phase 2 - Sending follow-up prompt: ${filename}`);
    finalScript = await agent.sendPrompt(content);
  }

  if (!finalScript || finalScript.trim().length === 0) {
    throw new Error('Phase 2 failed: No script generated');
  }

  log.info('=== PHASE 2: Script Generation COMPLETE ===', { 
    scriptLength: finalScript.length 
  });

  return finalScript;
}

/**
 * Chạy toàn bộ pipeline (Phase 1 + Phase 2)
 * 
 * @param {BrowserAgent} agent - Browser Agent instance (đã initialize)
 * @param {string} videoPath - Đường dẫn file .mp4
 * @returns {Promise<{videoSummary: string, finalScript: string}>}
 */
async function executePipeline(agent, videoPath) {
  // Phase 1: Phân tích video
  const videoSummary = await executePhase1(agent, videoPath);

  // Phase 2: Sinh kịch bản
  const finalScript = await executePhase2(agent, videoSummary);

  return {
    videoSummary,
    finalScript,
  };
}

module.exports = {
  executePhase1,
  executePhase2,
  executePipeline,
  loadPromptFiles,
};
