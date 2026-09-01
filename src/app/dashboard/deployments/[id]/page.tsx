"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Rocket,
  ArrowLeft,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  GitBranch,
  User,
  Shield,
  Layers,
  AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { TerminalViewer } from "@/components/TerminalViewer";

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deploymentId = params.id as string;

  const [deployment, setDeployment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchDeployment = async () => {
    try {
      const res = await fetch(`/api/deployments/${deploymentId}`);
      if (res.ok) {
        const data = await res.json();
        setDeployment(data.deployment);
      }
    } catch (err) {
      console.error("Failed to load deployment details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployment();
    // Auto-poll while running
    const interval = setInterval(() => {
      if (
        !deployment ||
        deployment.status === "QUEUED" ||
        deployment.status === "PREPARING" ||
        deployment.status === "CHECKING_OUT" ||
        deployment.status === "INSTALLING" ||
        deployment.status === "BUILDING" ||
        deployment.status === "DEPLOYING" ||
        deployment.status === "HEALTH_CHECK"
      ) {
        fetchDeployment();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [deploymentId, deployment?.status]);

  const handleRollback = async () => {
    if (!confirm(`Are you sure you want to rollback to deployment #${deploymentId.substring(0, 8)}?`)) {
      return;
    }

    setRollbackLoading(true);
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/rollback`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rollback failed");

      router.push(`/dashboard/deployments/${data.deploymentId}`);
    } catch (err: any) {
      setMessage(err.message);
      setRollbackLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading pipeline execution...</div>;
  }

  if (!deployment) {
    return <div className="p-8 text-center text-slate-400">Deployment not found.</div>;
  }

  const isFinalState = deployment.status === "SUCCESS" || deployment.status === "FAILED";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard/deployments" className="hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Deployments</span>
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-mono">#{deployment.id.substring(0, 8)}</span>
      </div>

      {/* Header Card */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Deployment #{deployment.id.substring(0, 8)}
            </h1>
            <StatusBadge status={deployment.status} size="md" />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-sans">Repository:</span>
              <Link
                href={`/dashboard/repositories/${deployment.repository?.id}`}
                className="text-blue-400 hover:underline font-semibold"
              >
                {deployment.repository?.name}
              </Link>
            </div>
            <div>
              <span className="text-slate-500 font-sans">Branch:</span>{" "}
              <span className="text-slate-200">{deployment.branch}</span>
            </div>
            {deployment.commitSha && (
              <div>
                <span className="text-slate-500 font-sans">Commit:</span>{" "}
                <span className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  {deployment.commitSha}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-500 font-sans">Trigger:</span>{" "}
              <span className="text-slate-300 uppercase">{deployment.triggerType}</span>
            </div>
            {deployment.duration && (
              <div>
                <span className="text-slate-500 font-sans">Duration:</span>{" "}
                <span className="text-emerald-400 font-semibold">{deployment.duration}s</span>
              </div>
            )}
          </div>

          {deployment.commitMessage && (
            <p className="text-xs text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800/80 font-mono inline-block">
              "{deployment.commitMessage}" {deployment.commitAuthor && <span className="text-slate-500">by {deployment.commitAuthor}</span>}
            </p>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDeployment}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {deployment.status === "SUCCESS" && (
            <button
              onClick={handleRollback}
              disabled={rollbackLoading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-2 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback to this</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}

      {/* Pipeline Stage Indicators */}
      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/90 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
        {[
          { label: "1. Trigger", stage: "QUEUED", done: true },
          { label: "2. Checkout", stage: "CHECKING_OUT", done: ["CHECKING_OUT", "INSTALLING", "BUILDING", "DEPLOYING", "HEALTH_CHECK", "SUCCESS"].includes(deployment.status) },
          { label: "3. Dependencies", stage: "INSTALLING", done: ["INSTALLING", "BUILDING", "DEPLOYING", "HEALTH_CHECK", "SUCCESS"].includes(deployment.status) },
          { label: "4. Build", stage: "BUILDING", done: ["BUILDING", "DEPLOYING", "HEALTH_CHECK", "SUCCESS"].includes(deployment.status) },
          { label: "5. Deploy", stage: "DEPLOYING", done: ["DEPLOYING", "HEALTH_CHECK", "SUCCESS"].includes(deployment.status) },
          { label: "6. Health Check", stage: "HEALTH_CHECK", done: deployment.status === "SUCCESS" },
        ].map((st, i) => (
          <div
            key={i}
            className={`p-2.5 rounded-lg border transition ${
              st.done
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : deployment.status === "FAILED" && !st.done
                ? "bg-rose-500/5 border-rose-500/20 text-rose-400/60"
                : "bg-slate-900 border-slate-800 text-slate-500"
            }`}
          >
            <span className="font-semibold">{st.label}</span>
          </div>
        ))}
      </div>

      {/* Real-time Terminal Log Stream */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pipeline Execution Output
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {deployment.logs?.length || 0} log lines captured
          </span>
        </div>

        <TerminalViewer
          logs={deployment.logs || []}
          title={`Pipeline #${deployment.id.substring(0, 8)} Console`}
          maxHeight="550px"
        />
      </div>
    </div>
  );
}
