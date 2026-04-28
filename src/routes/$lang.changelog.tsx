import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";

export const Route = createFileRoute("/$lang/changelog")({
  component: function ChangelogPage() {
    const t = useT();
    return (
      <section className="container mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
          {t("footer.changelog")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          A public log of edits and additions appears here.
        </p>
      </section>
    );
  },
});
