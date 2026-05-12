import { useState } from "react";
import { UserRound } from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Props = {
  src: string | null | undefined;
  name: string;
  className?: string;
  /** Fallback style when no image / broken image. */
  fallback?: "initials" | "icon";
  /** Tailwind classes for the fallback container (defaults to bg-accent text). */
  fallbackClassName?: string;
  iconClassName?: string;
  alt?: string;
  loading?: "eager" | "lazy";
};

export function CandidateAvatar({
  src,
  name,
  className,
  fallback = "initials",
  fallbackClassName,
  iconClassName,
  alt,
  loading = "lazy",
}: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  if (showImage) {
    return (
      <img
        src={src!}
        alt={alt ?? name}
        loading={loading}
        onError={() => setErrored(true)}
        className={className}
      />
    );
  }

  if (fallback === "icon") {
    return (
      <div
        className={
          fallbackClassName ??
          `${className ?? ""} flex items-center justify-center bg-secondary text-muted-foreground`
        }
      >
        <UserRound className={iconClassName ?? "h-7 w-7"} />
      </div>
    );
  }

  return (
    <div
      className={
        fallbackClassName ??
        `${className ?? ""} flex items-center justify-center bg-accent text-sm font-bold text-accent-foreground`
      }
    >
      {getInitials(name)}
    </div>
  );
}
