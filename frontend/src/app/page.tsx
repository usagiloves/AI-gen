"use client";

import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, FileText, Download, CheckCircle2, XCircle, Send, Copy } from "lucide-react";

// Types
type TaskStatus = "QUEUED" | "DOWNLOADING" | "ANALYZING" | "GENERATING" | "COMPLETED" | "FAILED";

interface Task {
  taskId: string;
  url: string;
  status: TaskStatus;
  videoSummary?: string;
  finalScript?: any;
  error?: string;
}

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [url, setUrl] = useState("");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [logs, setLogs] = useState<{timestamp: string, level: string, module: string, message: string}[]>([]);

  // Initialize Socket.IO
  useEffect(() => {
    const newSocket = io("http://localhost:3000");
    setSocket(newSocket);

    newSocket.on("connect", () => console.log("Connected to API via Socket.IO"));
    
    newSocket.on("task:created", (task: Task) => setActiveTask(task));
    newSocket.on("task:updated", (task: Task) => setActiveTask(task));
    newSocket.on("system:log", (log) => {
      setLogs((prev) => [...prev.slice(-49), log]); // Keep last 50 logs
    });
    
    return () => {
      newSocket.close();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setLogs([]); // Clear logs on new task
    try {
      const res = await fetch("http://localhost:3000/api/v1/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.task_id) {
        setActiveTask({ taskId: data.task_id, url, status: "QUEUED" });
        setUrl("");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (activeTask?.finalScript) {
      const text = activeTask.finalScript.content || JSON.stringify(activeTask.finalScript, null, 2);
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const steps = [
    { id: "QUEUED", label: "Queued" },
    { id: "DOWNLOADING", label: "Downloading" },
    { id: "ANALYZING", label: "Gemini Vision" },
    { id: "GENERATING", label: "Script Generation" },
    { id: "COMPLETED", label: "Done" },
  ];

  const getStepIndex = (status: TaskStatus) => steps.findIndex(s => s.id === status);
  const currentStepIndex = activeTask ? getStepIndex(activeTask.status) : -1;

  return (
    <main className="min-h-screen bg-[var(--background)] p-8 font-sans flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-7xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Reel Script OS</h1>
            <p className="text-sm text-foreground/60">Automated Video-to-Script Pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${socket?.connected ? 'bg-green-400' : 'bg-red-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${socket?.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </span>
          <span className="text-foreground/80">{socket?.connected ? "API Connected" : "Disconnected"}</span>
        </div>
      </header>

      {/* Input Composer */}
      {!activeTask || activeTask.status === 'COMPLETED' || activeTask.status === 'FAILED' ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl bg-white rounded-3xl p-2 shadow-xl shadow-slate-200 border border-slate-100 mb-8"
        >
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="url"
              placeholder="Paste Facebook Reel or YouTube Shorts URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-transparent px-6 py-4 outline-none text-foreground text-lg placeholder:text-slate-400"
              required
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="bg-primary hover:bg-primary/90 text-white px-6 py-4 rounded-2xl font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              Generate
            </button>
          </form>
        </motion.div>
      ) : null}

      {/* Main Workspace Area (2 Columns) */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Column: Pipeline & Logs */}
        <div className="flex flex-col gap-8 w-full">
          <AnimatePresence>
            {activeTask && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full"
              >
                <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Task: {activeTask.taskId}</h2>
                      <p className="text-sm text-foreground/60 truncate max-w-xs">{activeTask.url}</p>
                    </div>
                    {activeTask.status === 'FAILED' && (
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <XCircle size={16} /> Failed
                      </span>
                    )}
                  </div>

                  {/* Node-based Progress */}
                  <div className="relative mb-6">
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 rounded-full"></div>
                    <div 
                      className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full transition-all duration-500 ease-in-out"
                      style={{ width: `${Math.max(0, (currentStepIndex / (steps.length - 1)) * 100)}%` }}
                    ></div>
                    
                    <div className="relative flex justify-between">
                      {steps.map((step, idx) => {
                        const isCompleted = currentStepIndex > idx;
                        const isCurrent = currentStepIndex === idx;
                        const isFailed = activeTask.status === 'FAILED' && isCurrent;

                        return (
                          <div key={step.id} className="flex flex-col items-center gap-2">
                            <motion.div 
                              animate={{ 
                                scale: isCurrent ? [1, 1.1, 1] : 1,
                                boxShadow: isCurrent ? "0 0 15px rgba(79, 70, 229, 0.4)" : "none"
                              }}
                              transition={{ repeat: isCurrent ? Infinity : 0, duration: 2 }}
                              className={`w-8 h-8 rounded-full flex items-center justify-center border-4 relative z-10 transition-colors
                                ${isFailed ? 'bg-red-500 border-red-100 text-white' : 
                                  isCompleted ? 'bg-primary border-indigo-100 text-white' : 
                                  isCurrent ? 'bg-white border-primary text-primary' : 
                                  'bg-white border-slate-100 text-slate-300'}`}
                            >
                              {isCompleted ? <CheckCircle2 size={14} /> : 
                               isCurrent ? <Loader2 size={14} className="animate-spin" /> : 
                               <span className="text-xs font-bold">{idx + 1}</span>}
                            </motion.div>
                            <span className={`text-[11px] font-medium ${isCurrent ? 'text-primary' : 'text-slate-500'}`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Streaming Logs */}
                  <div className="bg-[#1E1E1E] rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs flex flex-col gap-1 border border-slate-800 shadow-inner">
                    {logs.length === 0 ? (
                      <div className="text-slate-500 italic">Waiting for system logs...</div>
                    ) : (
                      logs.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-2 break-all">
                          <span className="text-slate-500 shrink-0">[{log.timestamp.split('T')[1]?.substring(0, 8)}]</span>
                          <span className={`shrink-0 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'}`}>[{log.level.toUpperCase()}]</span>
                          <span className="text-purple-400 shrink-0">[{log.module}]</span>
                          <span className="text-slate-300">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Result Viewer */}
        <div className="flex flex-col w-full">
          <AnimatePresence>
            {activeTask?.status === 'COMPLETED' && activeTask.finalScript && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100"
              >
                <div className="flex flex-col mb-6 border-b border-slate-100 pb-6 relative">
                  <button 
                    onClick={handleCopy}
                    className="absolute top-0 right-0 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                    title="Copy Script"
                  >
                    {copied ? <CheckCircle2 className="text-green-500" /> : <Copy />}
                  </button>
                  <h2 className="text-2xl font-bold text-foreground leading-tight pr-12">
                    {activeTask.finalScript.title || "Generated Script"}
                  </h2>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {(activeTask.finalScript.hashtags || []).map((tag: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-indigo-50 text-primary text-sm font-medium rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-6 text-slate-700 leading-relaxed text-[15px]">
                  <p className="italic text-slate-500 border-l-4 border-slate-200 pl-4">
                    {activeTask.finalScript.description}
                  </p>
                  
                  <div className="whitespace-pre-wrap font-medium">
                    {activeTask.finalScript.content}
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Empty State when processing */}
            {activeTask && activeTask.status !== 'COMPLETED' && activeTask.status !== 'FAILED' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-100 border-dashed"
              >
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                  <Loader2 size={32} className="text-primary animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-slate-700">AI is crafting your script...</h3>
                <p className="text-slate-500 text-center mt-2 max-w-sm">
                  This process involves downloading the video, analyzing frames, and generating the final text. Please wait a few moments.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </main>
  );
}
