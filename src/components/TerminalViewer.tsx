"use client";

import React, { useState, useEffect, useRef } from "react";
import { Terminal as TerminalIcon, Copy, Check, Download } from "lucide-react";

export interface LogItem {
  id?: string;
  timestamp: string | Date;
  level?: string;
  stage?: string;
  message?: string;
  text?: string;
  stream?: "stdout" | "stderr";
}

interface TerminalViewerProps {
  logs: LogItem[];
  title?: string;
  maxHeight?: string;
  autoScroll?: boolean;
}

export const TerminalViewer: React.FC<TerminalViewerProps> = ({
  logs,
  title = "Deployment Logs",
  maxHeight = "450px",
  autoScroll = true,
}) => {
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    const rawText = logs
      .map((l) => {
        const time = new Date(l.timestamp).toLocaleTimeString();
        const stage = l.stage ? `[${l.stage}] ` : "";
        const content = l.message || l.text || "";
        return `[${time}] ${stage}${content}`;
      })
      .join("\n");

    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#070b13] overflow-hidden shadow-2xl flex flex-col font-mono text-xs">
      {/* Terminal Title Bar */}
      <div className="bg-[#0b101c] px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800 mx-2"></div>
          <div className="flex items-center gap-1.5 text-slate-300 font-sans font-medium text-xs">
            <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>{title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-[11px]"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Terminal Console Output */}
      <div
        className="p-4 overflow-y-auto space-y-1 text-slate-300 leading-relaxed select-text"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-6 text-center font-sans">
            No logs output yet. Waiting for deployment process...
          </div>
        ) : (
          logs.map((log, idx) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const text = log.message || log.text || "";
            const isError = log.level === "error" || log.stream === "stderr" || text.toLowerCase().includes("error");
            const isWarn = log.level === "warn" || text.toLowerCase().includes("warn");
            const isSuccess = log.stage === "SUCCESS" || text.toLowerCase().includes("successful");

            return (
              <div key={idx} className="flex items-start gap-2 hover:bg-slate-900/40 px-1 py-0.5 rounded">
                <span className="text-slate-600 select-none text-[11px] shrink-0 font-sans">{time}</span>
                {log.stage && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-semibold bg-slate-800 text-slate-400 shrink-0">
                    {log.stage}
                  </span>
                )}
                <span
                  className={`break-all ${
                    isError
                      ? "text-rose-400 font-medium"
                      : isWarn
                      ? "text-amber-300"
                      : isSuccess
                      ? "text-emerald-400 font-medium"
                      : "text-slate-200"
                  }`}
                >
                  {text}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
