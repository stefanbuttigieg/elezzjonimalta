import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";

function ComingSoon({ titleKey, descKey }: { titleKey: string; descKey: string }) {
  const t = useT();
  return (
    <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Vot Malta 2026
      </p>
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground md:text-4xl">{t(titleKey)}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t(descKey)}</p>
      <p className="mt-8 inline-flex rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted-foreground">
        Coming soon
      </p>
    </section>
  );
}

export const Route = createFileRoute("/$lang/districts")({
  component: () => <ComingSoon titleKey="home.entry.districts.title" descKey="home.entry.districts.desc" />,
});
