import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";

export const Route = createFileRoute("/$lang/compare")({
  component: function ComparePage() {
    const t = useT();
    return (
      <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
          {t("home.entry.compare.title")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {t("home.entry.compare.desc")}
        </p>
        <p className="mt-8 inline-flex rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted-foreground">
          Coming soon
        </p>
      </section>
    );
  },
});
