# 🚀 AI Reel Script Pipeline

An AI-powered platform that automatically transforms Reels, Shorts, and videos into high-quality scripts using computer vision and large language models.

---

# ✨ Vision

Instead of a traditional dashboard, this project is designed as an **AI Operating System**, where users can observe every stage of the AI pipeline in real time.

The system provides:

* Live AI workflow visualization
* Real-time streaming updates
* Multi-task processing
* Beautiful modern UI/UX
* Export-ready scripts
* Scalable SaaS architecture

---

# 🏗 Architecture

```text
User
  ↓
Frontend (Next.js)
  ↓
API Gateway
  ↓
Task Queue
  ↓
Video Downloader
  ↓
Frame Extraction
  ↓
Gemini Vision Analysis
  ↓
Script Generator
  ↓
Storage
```

---

# 🖥 Tech Stack

## Frontend

* Next.js 15
* TypeScript
* TailwindCSS v4
* Shadcn/UI
* Framer Motion
* Zustand
* TanStack Query
* Socket.IO Client

## Backend

* Node.js
* Express.js
* BullMQ / Redis Queue
* Gemini API
* FFmpeg
* Socket.IO Server

---

# 🎨 Design System

## Theme

* Background: `#09090B`
* Card: `rgba(255,255,255,0.05)`
* Primary: `#7C3AED`
* Accent: `#8B5CF6`
* Success: `#10B981`
* Error: `#EF4444`

## UI Principles

* Dark-first experience
* Glassmorphism
* Gradient Mesh
* Micro animations
* Motion-driven interactions
* AI activity streaming
* Responsive design

---

# 📁 Project Structure

```text
frontend/
├── app/
├── components/
│   ├── ai-workspace/
│   ├── pipeline/
│   ├── script-viewer/
│   ├── analytics/
│   └── ui/
├── hooks/
├── services/
├── store/
├── lib/
├── types/
└── styles/

backend/
├── src/
│   ├── controllers/
│   ├── services/
│   ├── queues/
│   ├── workers/
│   ├── sockets/
│   ├── middleware/
│   └── utils/
└── storage/
```

---

# ⚡ Features

## 1. AI Workspace

* Paste Reel or Shorts URL
* Drag & Drop support
* Instant task creation
* Beautiful input composer

---

## 2. Live Pipeline Visualization

```text
URL
 ↓
Download
 ↓
Frame Analysis
 ↓
Gemini Vision
 ↓
Script Generation
 ↓
Formatting
 ↓
Completed
```

Each stage has:

* Animated state indicator
* Streaming logs
* Estimated remaining time
* Progress transitions

---

## 3. Real-Time Updates

The frontend receives live events through:

* WebSocket
  or
* Server-Sent Events (SSE)

No polling required.

---

## 4. Multi-Task Queue

Features:

* Queue management
* Retry task
* Cancel task
* Duplicate task
* Priority execution

---

## 5. Script Viewer

Displays:

* Title
* Description
* Hashtags
* Generated Script
* Scene Breakdown

Actions:

* Copy
* Export TXT
* Export JSON
* Export Markdown
* Send to external editors

---

## 6. Analytics Dashboard

Displays:

* Total generated scripts
* Success rate
* Average processing time
* API cost statistics
* Daily usage metrics

---

# 🔌 API Endpoints

## Create Task

```http
POST /api/v1/tasks
```

Body:

```json
{
  "url": "https://..."
}
```

---

## Get Task

```http
GET /api/v1/tasks/:id
```

---

## Get History

```http
GET /api/v1/tasks
```

---

## Cancel Task

```http
DELETE /api/v1/tasks/:id
```

---

# 📡 WebSocket Events

## Client → Server

```text
task:create
task:cancel
task:retry
```

## Server → Client

```text
task:queued
task:downloading
task:analyzing
task:generating
task:completed
task:failed
```

---

# 📦 Installation

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Backend

```bash
cd backend
npm install
npm run dev
```

---

# 🚀 Future Roadmap

* Authentication
* Team collaboration
* Prompt templates
* Video editor integration
* AI thumbnail generation
* Multi-language support
* SaaS billing system
* AI agent orchestration
* Mobile application

---

# 💡 Product Philosophy

The goal of this project is not to build another CRUD dashboard.

The goal is to create an **AI Operating System** where users can watch, manage, and collaborate with AI as it transforms videos into compelling scripts.
