/**
 * Gemini Web UI DOM Selectors
 * 
 * Tách riêng selectors để dễ cập nhật khi Google thay đổi giao diện.
 * Khi gặp lỗi "selector not found", chỉ cần inspect lại DOM và sửa file này.
 * 
 * ĐÃ CẬP NHẬT: 2026-06-29 — Mở rộng fallback selectors cho Gemini DOM mới
 */

module.exports = {
  // === File Upload ===
  // Input ẩn để upload file — CHỈ XUẤT HIỆN sau khi click ATTACHMENT_BUTTON
  FILE_INPUT: 'input[type="file"]',

  // Nút "+" mở menu đính kèm (icon dấu cộng) — aria-label tiếng Việt + English
  ATTACHMENT_BUTTON: 'button[aria-label="Nội dung tải lên và công cụ"], button[aria-label="Upload and tools"], button[aria-label="Add files"], button[aria-label="Thêm tệp"]',

  // Indicator khi file đang upload/processing
  UPLOAD_LOADING: 'mat-progress-bar, [data-loading="true"], .uploading-indicator, .upload-progress',

  // Container hiển thị file đã upload thành công (chỉ lấy trong khung chat input)
  UPLOAD_COMPLETE: '.chat-input-area .file-chip, rich-textarea .file-chip, rich-textarea .attachment-chip, rich-textarea [data-file-attached="true"], .chat-window .file-chip, [data-test-id="input-file-chip"]',

  // === Chat Input ===
  // Ô nhập text chính (contenteditable div — Quill editor)
  CHAT_INPUT: '.ql-editor.textarea[contenteditable="true"]',

  // Nút gửi tin nhắn — tìm bằng aria-label hoặc data-test-id
  SEND_BUTTON: 'button[aria-label="Gửi tin nhắn"], button[aria-label="Gửi"], button[aria-label="Send message"], button[aria-label="Send"], button[data-test-id="send-button"], button.send-button',

  // === Response ===
  // Container chứa response text từ Gemini (model response markdown)
  // Mở rộng nhiều fallback patterns vì Gemini thay đổi DOM rất thường xuyên
  RESPONSE_CONTAINER: [
    'model-response .markdown',
    '.model-response-text .markdown',
    'div[data-message-author="model"] .markdown',
    'message-content:not(:has(user-query)) .markdown'
  ].join(', '),

  // Indicator khi Gemini đang generating response
  RESPONSE_LOADING: [
    'mat-progress-spinner',
    '.loading-indicator',
    '.thinking-indicator',
    '.response-loading',
    '.generating-indicator',
    '[data-loading-state]',
    '[data-is-streaming="true"]',
    '.streaming-indicator',
  ].join(', '),

  // Nút "Stop generating" (xuất hiện khi đang generate)
  STOP_BUTTON: [
    'button[aria-label*="Ngừng"]',
    'button[aria-label*="Dừng"]',
    'button[aria-label*="Stop"]',
    '.stop-generating-button',
    'button:has(svg.stop-icon)'
  ].join(', '),

  // === Navigation ===
  // Nút tạo chat mới
  NEW_CHAT_BUTTON: 'a[aria-label="Cuộc trò chuyện mới"], button[aria-label="Cuộc trò chuyện mới"], a[href="/app"], button[aria-label="New chat"]',

  // === Upload menu items (sau khi click ATTACHMENT_BUTTON) ===
  // Mục "Tải tệp lên" trong menu popup. Loại trừ Google Drive để không mở nhầm modal Drive.
  UPLOAD_FILE_MENU_ITEM: 'button[data-test-id="upload-file"], [role="menuitem"]:has-text("Tải"):not(:has-text("Drive")), [role="menuitem"]:has-text("Upload"):not(:has-text("Drive"))',

  // === Auth Detection ===
  LOGGED_IN_INDICATOR: 'img[aria-label*="Tài khoản Google"], .gb_A',
  LOGIN_PAGE: 'form[action*="accounts.google.com"]',
};
