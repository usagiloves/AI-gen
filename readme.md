Markdown
# 🎬 AI Reel Script Generator Pipeline (Zero-API Browser Agent)

[![Node.js](https://img.shields.io/badge/Node.js->=18.x-green.svg)]()
[![Playwright](https://img.shields.io/badge/Playwright-Automation-blue.svg)]()
[![Pipeline](https://img.shields.io/badge/Pipeline-2_Phase_Dynamic-orange.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)]()

Hệ thống tự động hóa toàn diện từ đầu đến cuối: Nhận link Facebook Reel, tải video, phân tích nội dung và tạo kịch bản chuyên sâu bằng cách điều khiển trình duyệt ẩn danh (Browser Agent) tương tác trực tiếp với giao diện Web của Google Gemini. 

**🔥 Điểm nổi bật: Hệ thống cam kết 100% Zero-API đối với Gemini. Mọi thao tác upload và chat đều là giả lập hành vi người dùng thật, giúp tiết kiệm hoàn toàn chi phí API.**

---

## 📑 Mục lục
1. [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
2. [Cơ chế xử lý Video (Zero-API)](#-cơ-chế-xử-lý-video-zero-api)
3. [Luồng xử lý 2 Giai đoạn (2-Phase)](#-luồng-xử-lý-2-giai-đoạn-2-phase)
4. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
5. [Cài đặt môi trường Local](#-cài-đặt-môi-trường-local)
6. [Tài liệu API (API Endpoints)](#-tài-liệu-api-api-endpoints)
7. [Triển khai Production (Docker)](#-triển-khai-production-docker)
8. [Xử lý sự cố & Rủi ro](#-xử-lý-sự-cố--rủi-ro)

---

## 🏛️ Kiến trúc hệ thống

Dự án được xây dựng theo mô hình **Event-Driven Task Queue** để đảm bảo tính ổn định khi xử lý các tác vụ nặng:

* **API Gateway:** Tiếp nhận Request (URL FB Reel) từ client và trả về `task_id`.
* **Message Queue (Redis):** Quản lý hàng đợi, tránh quá tải khi có nhiều request đồng thời. Hỗ trợ cơ chế retry khi worker thất bại.
* **Downloader Worker:** Tích hợp `yt-dlp` để bóc tách và tải video MP4 từ Facebook.
* **Browser Agent (Playwright):** Core Engine giả lập phiên người dùng (đã nạp Session Cookie) để thao tác DOM, vượt qua bot detection.
* **Prompt Engine:** Quản lý luồng thực thi liên kết prompt động (Prompt Chaining) tự động bơm dữ liệu.

---

## 🎥 Cơ chế xử lý Video (Zero-API)

Để bypass hoàn toàn API trả phí, hệ thống xử lý video theo vòng đời khép kín trên giao diện web:

1.  **Tải Video Cục Bộ:** `yt-dlp` tải file `.mp4` chất lượng cao nhất về lưu tạm tại `/temp_videos`.
2.  **DOM File Injection:** Playwright mở `gemini.google.com`. Hệ thống tìm chính xác thẻ `<input type="file">` ẩn trên giao diện và gọi lệnh `.setInputFiles()` để đính kèm đường dẫn file `.mp4` cục bộ vào DOM.
3.  **Validation & Timeout:** Playwright theo dõi DOM (chờ thanh loading hoặc icon upload biến mất) đảm bảo video đã được server Gemini xử lý xong trước khi nhấn "Gửi".
4.  **Auto-Clean (Garbage Collection):** Dù luồng thành công hay thất bại, sự kiện `finally` sẽ kích hoạt lệnh xóa vĩnh viễn file `.mp4` khỏi ổ cứng để ngăn chặn tình trạng tràn bộ nhớ (OOM).

---

## 🔄 Luồng xử lý 2 Giai đoạn (2-Phase)

Hệ thống tách biệt việc phân tích video và sinh kịch bản thành 2 giai đoạn độc lập nhằm đảm bảo ngữ cảnh cho AI.

### 🔹 Phase 1: Phân tích Video (Tóm tắt)
1.  Upload video lên giao diện Gemini.
2.  Quét thư mục `prompt_phase_1/`. Gửi lần lượt các file `.txt` có trong này vào cùng một phiên chat.
3.  **Output:** Trích xuất (Scrape) toàn bộ đoạn text tóm tắt nội dung câu chuyện video.

### 🔹 Phase 2: Bơm dữ liệu (Template Injection) & Sinh kịch bản
1.  Backend đọc file mẫu `Prompt KB.txt` từ thư mục `prompt_phase_2/`.
2.  Tìm vị trí khóa: `CÂU CHUYỆN:` và **bơm (inject)** đoạn Output của Phase 1 vào ngay phía sau dòng này.
3.  Gửi nguyên văn khối Prompt đã được tổng hợp lên Gemini.
4.  **Output:** Trả về kịch bản cuối cùng (JSON hoặc Text) cho người dùng qua webhook hoặc polling API.

---

## 📂 Cấu trúc thư mục

```text
📁 AI-Reel-Script-Pipeline/
├── 📁 prompt_phase_1/           # Chứa các file yêu cầu phân tích video
│   └── 01_phan_tich_video.txt   
├── 📁 prompt_phase_2/           # Chứa template kịch bản
│   └── Prompt KB.txt            # File cốt lõi chứa từ khóa "CÂU CHUYỆN:"
├── 📁 temp_videos/              # (Auto-generated) Chứa file tải tạm
├── 📁 cookies/                  # Chứa state.json (Session Google)
├── 📁 src/
│   ├── api/                     # REST API / Express.js server
│   ├── workers/                 # Hàng đợi & Background jobs
│   ├── modules/
│   │   ├── downloader.js        # Logic yt-dlp tải FB Reels
│   │   ├── browser_agent.js     # Tương tác Playwright & DOM
│   │   └── prompt_engine.js     # Logic bơm chuỗi Phase 1 -> Phase 2
│   └── utils/
│       └── logger.js            # Ghi log hệ thống
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
💻 Cài đặt môi trường Local
1. Yêu cầu hệ thống
Node.js (v18.x trở lên)

Python 3.10+ (Yêu cầu để chạy bản yt-dlp mới nhất)

FFmpeg (Phải có trong biến môi trường PATH)

Redis Server (Nếu dùng Queue)

2. Cài đặt Dependencies
Bash
npm install

# Cài đặt Playwright Browsers và các thư viện hệ điều hành đi kèm
npx playwright install --with-deps chromium
3. Khởi tạo Authentication (Bắt Buộc)
Do hệ thống không dùng API Key, bạn phải cung cấp Cookie hợp lệ:

Bash
node src/scripts/login.js
Lệnh này sẽ mở một cửa sổ Chromium thực tế. Bạn hãy đăng nhập tài khoản Google bằng tay. Đăng nhập xong, tắt trình duyệt, file cookies/state.json sẽ được tự động lưu lại.

4. Khởi chạy
Bash
# Terminal 1: Chạy API Server
npm run start:api

# Terminal 2: Chạy Worker xử lý ngầm (Playwright)
npm run start:worker
🌐 Tài liệu API (API Endpoints)
POST /api/v1/generate-script
Tạo một task mới để xử lý video.

Body Request:

JSON
{
  "url": "[https://www.facebook.com/reel/1234567890](https://www.facebook.com/reel/1234567890)",
  "webhook_url": "[https://your-domain.com/callback](https://your-domain.com/callback)" // Tùy chọn
}
Response:

JSON
{
  "status": "success",
  "message": "Task added to queue",
  "task_id": "req_8a7b6c5d4e"
}
GET /api/v1/task/:task_id
Kiểm tra trạng thái và lấy kết quả của task.

Response (Khi hoàn thành):

JSON
{
  "task_id": "req_8a7b6c5d4e",
  "status": "COMPLETED",
  "video_summary": "Nội dung tóm tắt từ Phase 1...",
  "final_script": "Nội dung kịch bản tiếng Tây Ban Nha từ Phase 2..."
}
🐳 Triển khai Production (Docker)
Hệ thống Browser Automation tiêu tốn nhiều RAM và CPU. Môi trường Docker giúp cách ly tài nguyên và đảm bảo đủ thư viện đồ họa (X11/Wayland) cho trình duyệt.

1. Build Image
Bash
docker build -t ai-reel-pipeline .
2. Khởi chạy bằng Docker Compose
Tạo file docker-compose.yml (đã có sẵn trong dự án) và chạy:

Bash
docker-compose up -d
Lưu ý: Volume mount cực kỳ quan trọng để giữ lại Cookie và các file Prompt tĩnh mà không cần build lại Image.

⚠️ Xử lý sự cố & Rủi ro (Troubleshooting)
Lỗi TimeoutError: selector not found

Nguyên nhân: Giao diện web của Google Gemini đã cập nhật, làm thay đổi cấu trúc thẻ HTML (Class name).

Giải pháp: Mở giao diện Gemini, F12 kiểm tra lại các phần tử (Nút Upload, Ô chatbox, Nút Send) và cập nhật lại Selector trong file src/modules/browser_agent.js.

Tài khoản Google bị chặn (Bot Detection / Captcha)

Giải pháp: Đảm bảo đã cài plugin puppeteer-extra-plugin-stealth cho Playwright. Nếu chạy số lượng lớn, hãy thiết lập Proxy xoay vòng (Rotated Residential Proxies) và cấu hình delay ngẫu nhiên (human-typing delay) khi bot gõ văn bản.

Lỗi không tải được video Facebook

Nguyên nhân: Facebook thay đổi thuật toán mã hóa video.

Giải pháp: Cập nhật yt-dlp lên phiên bản mới nhất: pip install -U yt-dlp (hoặc update qua npm wrapper).