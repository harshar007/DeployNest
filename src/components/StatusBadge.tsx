import React from "react";
import { CheckCircle2, XCircle, Clock, PlayCircle, StopCircle, RefreshCw, AlertCircle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "md",
  showIcon = true,
}) => {
  const normalized = status?.toUpperCase() || "UNKNOWN";

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs font-medium",
    lg: "px-3 py-1.5 text-sm font-semibold",
  }[size];

  switch (normalized) {
    case "RUNNING":
    case "SUCCESS":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 ${sizeClasses}`}>
          {showIcon && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
          {normalized === "SUCCESS" ? "Success" : "Running"}
        </span>
      );

    case "DEPLOYING":
    case "BUILDING":
    case "INSTALLING":
    case "CHECKING_OUT":
    case "PREPARING":
    case "HEALTH_CHECK":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 ${sizeClasses}`}>
          {showIcon && <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />}
          {normalized.replace("_", " ")}
        </span>
      );

    case "QUEUED":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 ${sizeClasses}`}>
          {showIcon && <Clock className="w-3 h-3 text-amber-400" />}
          Queued
        </span>
      );

    case "CONFIGURED":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 ${sizeClasses}`}>
          {showIcon && <CheckCircle2 className="w-3 h-3 text-indigo-400" />}
          Configured
        </span>
      );

    case "STOPPED":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 ${sizeClasses}`}>
          {showIcon && <StopCircle className="w-3 h-3 text-slate-400" />}
          Stopped
        </span>
      );

    case "FAILED":
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 ${sizeClasses}`}>
          {showIcon && <XCircle className="w-3 h-3 text-rose-400" />}
          Failed
        </span>
      );

    case "NOT_CONFIGURED":
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 ${sizeClasses}`}>
          {showIcon && <AlertCircle className="w-3 h-3 text-zinc-400" />}
          Not Configured
        </span>
      );
  }
};
