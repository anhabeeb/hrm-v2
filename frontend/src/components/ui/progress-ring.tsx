/** Radial progress ring for leave balances — V3 primitive, ported as-is. */
export function ProgressRing({
  value,
  max,
  color,
  label,
  sublabel = "taken"
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  sublabel?: string;
}) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(value / safeMax, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={`${label}: ${value} of ${max} days taken`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--v3-border)" strokeWidth={6} />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="38" textAnchor="middle" fontSize="15" fontWeight={500} className="fill-slate-950">
          {value}/{max}
        </text>
        <text x="42" y="53" textAnchor="middle" fontSize="10" className="fill-slate-400">
          {sublabel}
        </text>
      </svg>
      <span className="text-center text-[13px] text-muted-foreground">{label}</span>
    </div>
  );
}
