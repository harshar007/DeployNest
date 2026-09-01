"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  RefreshCw,
  Layers,
  Globe,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { HealthGauge } from "@/components/HealthGauge";

export default function ServersPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/system/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data.health);
      }
    } catch (err) {
      console.error("Failed to load server health:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "--";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days} days, ${hours} hours, ${mins} minutes`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Server className="w-6 h-6 text-blue-400" />
            VPS Infrastructure & Servers
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time host system diagnostics, hardware utilization, and deployment node status.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            fetchHealth();
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Primary Server Card */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Primary Node ({health?.os?.hostname || "VPS-01"})
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  ONLINE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {health?.os?.distro} ({health?.os?.platform}) • Release: {health?.os?.release}
              </p>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-slate-400">
            <p>Uptime: <span className="text-slate-200">{formatUptime(health?.os?.uptime)}</span></p>
          </div>
        </div>

        {/* Hardware Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthGauge
            label="CPU Load"
            percent={health?.cpu?.usagePercent || 0}
            subtext={`${health?.cpu?.cores || 1} Cores • ${health?.cpu?.model || "Processor"}`}
            color="blue"
          />

          <HealthGauge
            label="RAM Memory"
            percent={health?.memory?.usagePercent || 0}
            subtext={`${formatBytes(health?.memory?.usedBytes)} / ${formatBytes(health?.memory?.totalBytes)}`}
            color="purple"
          />

          <HealthGauge
            label="Disk Storage"
            percent={health?.disk?.usagePercent || 0}
            subtext={`${formatBytes(health?.disk?.usedBytes)} / ${formatBytes(health?.disk?.totalBytes)}`}
            color="emerald"
          />
        </div>

        {/* Host Specs Breakdown */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Platform</span>
            <span className="text-slate-200 font-semibold">{health?.os?.platform}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Hostname</span>
            <span className="text-slate-200 font-semibold truncate block">{health?.os?.hostname}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Free Memory</span>
            <span className="text-emerald-400 font-semibold">{formatBytes(health?.memory?.freeBytes)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">HTTP Port</span>
            <span className="text-blue-400 font-semibold">29870 (0.0.0.0)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
