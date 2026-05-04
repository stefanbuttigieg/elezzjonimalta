import { computeCandidateCompletion, completionTone, type CandidateForCompletion, type CustomFieldDef } from "@/lib/candidateCompletion";

interface Props {
  candidate: CandidateForCompletion;
  customFieldDefs?: CustomFieldDef[];
  size?: "sm" | "md";
  showMissing?: boolean;
}

export function CompletionMeter({ candidate, customFieldDefs = [], size = "sm", showMissing = false }: Props) {
  const { percent, missing, filled, total } = computeCandidateCompletion(candidate, customFieldDefs);
  const tone = completionTone(percent);
  const colour =
    tone === "high"
      ? "bg-emerald-500"
      : tone === "medium"
      ? "bg-amber-500"
      : "bg-rose-500";
  const textColour =
    tone === "high"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "medium"
      ? "text-amber-700 dark:text-amber-300"
      : "text-rose-700 dark:text-rose-300";
  const tooltip =
    missing.length === 0
      ? "Profile complete"
      : `Missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? `, +${missing.length - 8} more` : ""}`;

  return (
    <div className={size === "md" ? "space-y-1.5" : "space-y-1"}>
      <div className="flex items-center gap-2">
        <div className={size === "md" ? "h-2 flex-1 overflow-hidden rounded-full bg-muted" : "h-1.5 w-20 overflow-hidden rounded-full bg-muted"}>
          <div className={`h-full ${colour} transition-all`} style={{ width: `${percent}%` }} />
        </div>
        <span className={`tabular-nums ${size === "md" ? "text-sm font-semibold" : "text-xs"} ${textColour}`} title={tooltip}>
          {percent}%
        </span>
      </div>
      {showMissing && missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filled}/{total} pts · missing: {missing.slice(0, 5).join(", ")}
          {missing.length > 5 ? `, +${missing.length - 5} more` : ""}
        </p>
      )}
    </div>
  );
}
