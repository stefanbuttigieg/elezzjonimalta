import { AlertTriangle, Info, AlertCircle, Sparkles } from "lucide-react";
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

// Top-bar styling per variant — full-width, more prominent than the inline card.
const topBarStyles: Record<
  string,
  { wrapper: string; iconWrap: string; icon: typeof AlertTriangle; title: string; message: string }
> = {
  warning: {
    wrapper:
      "border-b border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
    iconWrap: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: AlertTriangle,
    title: "text-amber-900 dark:text-amber-100",
    message: "text-amber-900/80 dark:text-amber-100/80",
  },
  info: {
    wrapper:
      "border-b border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/8 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/10",
    iconWrap: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    icon: Sparkles,
    title: "text-emerald-900 dark:text-emerald-50",
    message: "text-emerald-900/80 dark:text-emerald-100/80",
  },
  error: {
    wrapper:
      "border-b border-red-500/40 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent",
    iconWrap: "bg-red-500/15 text-red-700 dark:text-red-300",
    icon: AlertCircle,
    title: "text-red-900 dark:text-red-100",
    message: "text-red-900/80 dark:text-red-100/80",
  },
};

interface DisclaimerBannerProps {
  placement: string;
  className?: string;
  /** Render as a full-width, more prominent top bar. Use above the site header. */
  as?: "card" | "topbar";
}

export function DisclaimerBanner({
  placement,
  className,
  as = "card",
}: DisclaimerBannerProps) {
  const { data: disclaimers } = useDisclaimers(placement);

  if (!disclaimers?.length) return null;

  if (as === "topbar") {
    return (
      <div className={className}>
        {disclaimers.map((d) => {
          const style = topBarStyles[d.variant] || topBarStyles.info;
          const IconComponent = style.icon;
          return (
            <div key={d.id} role="status" className={cn("w-full", style.wrapper)}>
              <div className="container mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 md:items-center">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full md:mt-0",
                    style.iconWrap,
                  )}
                >
                  <IconComponent className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-semibold leading-snug md:text-[15px]", style.title)}>
                    {d.title}
                  </p>
                  <p className={cn("mt-0.5 text-xs leading-relaxed md:text-sm", style.message)}>
                    {d.message}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

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
