import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  className?: string;
  label?: string;
  fullscreen?: boolean;
};

/**
 * Brand loading indicator: the lowercase "e" from the Elezzjoni wordmark
 * (Source Serif 4) with a subtle gradient sweep flowing through it.
 */
export function ELoader({ size = 56, className, label = "Loading", fullscreen = false }: Props) {
  const node = (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="e-loader-glyph"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: size,
          lineHeight: 1,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        e
      </span>
      <span className="sr-only">{label}…</span>
    </div>
  );

  if (!fullscreen) return node;

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-background">
      {node}
    </div>
  );
}

export default ELoader;
