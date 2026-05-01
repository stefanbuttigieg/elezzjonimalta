import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { useDisclaimers } from "@/hooks/useDisclaimers";
import { cn } from "@/lib/utils";

const variantStyles: Record<
  string,
  { border: string; bg: string; icon: typeof AlertTriangle; iconColor: string }
> = {
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    icon: AlertTriangle,
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    icon: Info,
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  error: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    icon: AlertCircle,
    iconColor: "text-red-600 dark:text-red-400",
  },
};

interface DisclaimerBannerProps {
  placement: string;
  className?: string;
}

export function DisclaimerBanner({ placement, className }: DisclaimerBannerProps) {
  const { data: disclaimers } = useDisclaimers(placement);

  if (!disclaimers?.length) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {disclaimers.map((d) => {
        const style = variantStyles[d.variant] || variantStyles.warning;
        const IconComponent = style.icon;
        return (
          <div
            key={d.id}
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4",
              style.border,
              style.bg,
            )}
          >
            <IconComponent className={cn("mt-0.5 h-5 w-5 shrink-0", style.iconColor)} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{d.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
