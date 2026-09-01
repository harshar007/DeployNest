import React from "react";

interface HealthGaugeProps {
  label: string;
  percent: number;
  subtext?: string;
  color?: "blue" | "emerald" | "amber" | "rose" | "purple";
}

export const HealthGauge: React.FC<HealthGaugeProps> = ({
  label,
  percent,
  subtext,
  color = "blue",
}) => {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent || 0)));

  const colorMap = {
    blue: {
      bar: "bg-blue-500",
      text: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    emerald: {
      bar: "bg-emerald-500",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    amber: {
      bar: "bg-amber-500",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    rose: {
      bar: "bg-rose-500",
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    purple: {
      bar: "bg-purple-500",
      text: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
  }[color];

  // Dynamic warning color for high usage
  let dynamicColor = colorMap;
  if (safePercent >= 85) {
    dynamicColor = {
      bar: "bg-rose-500",
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    };
  } else if (safePercent >= 70) {
    dynamicColor = {
      bar: "bg-amber-500",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    };
  }

  return (
    <div className={`p-4 rounded-xl bg-slate-900/60 border ${dynamicColor.border} space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`text-base font-bold font-mono ${dynamicColor.text}`}>
          {safePercent}%
        </span>
      </div>

      <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${dynamicColor.bar} transition-all duration-500 rounded-full`}
          style={{ width: `${safePercent}%` }}
        />
      </div>

      {subtext && <p className="text-[11px] text-slate-500 font-mono">{subtext}</p>}
    </div>
  );
};
