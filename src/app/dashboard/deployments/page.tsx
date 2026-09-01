"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Rocket,
  RefreshCw,
  GitBranch,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  const fetchDeployments = async () => {
    try {
      const url = statusFilter !== "ALL"
        ? `/api/deployments?status=${statusFilter}`
        : "/api/deployments";

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments);
      }
    } catch (err) {
      console.error("Failed to load deployments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            Deployment Pipelines
            <span className="text-xs uppercase font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
              {deployments.length} Runs
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            End-to-end execution history, step logs, build output, and rollback controls.
          </p>
        </div>

        <button
          onClick={fetchDeployments}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 bg-[#0d1322] border border-slate-800/80 p-2 rounded-xl overflow-x-auto">
        {["ALL", "SUCCESS", "DEPLOYING", "FAILED", "QUEUED"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition ${
              statusFilter === st
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Deployments Table */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <th className="pb-3 font-semibold">Deployment ID</th>
                <th className="pb-3 font-semibold">Repository</th>
                <th className="pb-3 font-semibold">Branch</th>
                <th className="pb-3 font-semibold">Commit & Message</th>
                <th className="pb-3 font-semibold">Trigger</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Duration</th>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Loading deployments...
                  </td>
                </tr>
              ) : deployments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    No deployment history found matching the selected filter.
                  </td>
                </tr>
              ) : (
                deployments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 font-mono text-slate-400">
                      <Link
                        href={`/dashboard/deployments/${d.id}`}
                        className="text-blue-400 hover:underline font-semibold"
                      >
                        #{d.id.substring(0, 8)}
                      </Link>
                    </td>
                    <td className="py-3 font-semibold text-slate-200">
                      {d.repository?.name || "Repository"}
                    </td>
                    <td className="py-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                        {d.branch}
                      </span>
                    </td>
                    <td className="py-3 max-w-xs truncate">
                      {d.commitSha && (
                        <span className="font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 text-[11px] mr-2">
                          {d.commitSha}
                        </span>
                      )}
                      <span className="text-slate-300">{d.commitMessage || "No commit message"}</span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-900 border border-slate-800 text-slate-400">
                        {d.triggerType}
                      </span>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={d.status} size="sm" />
                    </td>
                    <td className="py-3 font-mono text-slate-400">
                      {d.duration ? `${d.duration}s` : "--"}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-slate-500">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/dashboard/deployments/${d.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                      >
                        <span>Logs</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
