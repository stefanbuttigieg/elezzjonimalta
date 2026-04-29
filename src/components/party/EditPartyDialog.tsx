import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type EditablePartyFields = {
  id: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  description_en: string | null;
  description_mt: string | null;
  slogan_en: string | null;
  slogan_mt: string | null;
  founded_year: number | null;
  leader_name: string | null;
  website: string | null;
  wikipedia_url: string | null;
};

type FormState = {
  name_en: string;
  name_mt: string;
  short_name: string;
  color: string;
  logo_url: string;
  cover_image_url: string;
  description_en: string;
  description_mt: string;
  slogan_en: string;
  slogan_mt: string;
  founded_year: string;
  leader_name: string;
  website: string;
  wikipedia_url: string;
};

function toForm(p: EditablePartyFields): FormState {
  return {
    name_en: p.name_en ?? "",
    name_mt: p.name_mt ?? "",
    short_name: p.short_name ?? "",
    color: p.color ?? "",
    logo_url: p.logo_url ?? "",
    cover_image_url: p.cover_image_url ?? "",
    description_en: p.description_en ?? "",
    description_mt: p.description_mt ?? "",
    slogan_en: p.slogan_en ?? "",
    slogan_mt: p.slogan_mt ?? "",
    founded_year: p.founded_year != null ? String(p.founded_year) : "",
    leader_name: p.leader_name ?? "",
    website: p.website ?? "",
    wikipedia_url: p.wikipedia_url ?? "",
  };
}

export function EditPartyDialog({ party }: { party: EditablePartyFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(party));

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedName = form.name_en.trim();
      if (!trimmedName) {
        toast.error("English name is required");
        setSaving(false);
        return;
      }
      const year = form.founded_year.trim() ? Number(form.founded_year) : null;
      if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
        toast.error("Founded year must be between 1800 and 2100");
        setSaving(false);
        return;
      }

      const payload = {
        name_en: trimmedName,
        name_mt: form.name_mt.trim() || null,
        short_name: form.short_name.trim() || null,
        color: form.color.trim() || null,
        logo_url: form.logo_url.trim() || null,
        cover_image_url: form.cover_image_url.trim() || null,
        description_en: form.description_en.trim() || null,
        description_mt: form.description_mt.trim() || null,
        slogan_en: form.slogan_en.trim() || null,
        slogan_mt: form.slogan_mt.trim() || null,
        founded_year: year,
        leader_name: form.leader_name.trim() || null,
        website: form.website.trim() || null,
        wikipedia_url: form.wikipedia_url.trim() || null,
      };

      const { error } = await supabase.from("parties").update(payload).eq("id", party.id);
      if (error) throw error;

      toast.success("Party updated");
      setOpen(false);
      await router.invalidate();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to save changes";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm(toForm(party));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          Edit page
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit party</DialogTitle>
          <DialogDescription>
            Update each field individually. Changes are saved to the published profile.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Name (English)" required>
              <Input
                value={form.name_en}
                onChange={(e) => update("name_en", e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="Name (Maltese)">
              <Input
                value={form.name_mt}
                onChange={(e) => update("name_mt", e.target.value)}
                maxLength={200}
              />
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Short name">
              <Input
                value={form.short_name}
                onChange={(e) => update("short_name", e.target.value)}
                maxLength={20}
              />
            </Field>
            <Field label="Founded year">
              <Input
                type="number"
                value={form.founded_year}
                onChange={(e) => update("founded_year", e.target.value)}
                min={1800}
                max={2100}
              />
            </Field>
            <Field label="Brand color (hex)">
              <Input
                value={form.color}
                onChange={(e) => update("color", e.target.value)}
                placeholder="#1f2937"
                maxLength={20}
              />
            </Field>
          </div>

          <Field label="Leader name">
            <Input
              value={form.leader_name}
              onChange={(e) => update("leader_name", e.target.value)}
              maxLength={200}
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Slogan (English)">
              <Input
                value={form.slogan_en}
                onChange={(e) => update("slogan_en", e.target.value)}
                maxLength={300}
              />
            </Field>
            <Field label="Slogan (Maltese)">
              <Input
                value={form.slogan_mt}
                onChange={(e) => update("slogan_mt", e.target.value)}
                maxLength={300}
              />
            </Field>
          </div>

          <Field label="Description (English)">
            <Textarea
              value={form.description_en}
              onChange={(e) => update("description_en", e.target.value)}
              rows={4}
              maxLength={4000}
            />
          </Field>
          <Field label="Description (Maltese)">
            <Textarea
              value={form.description_mt}
              onChange={(e) => update("description_mt", e.target.value)}
              rows={4}
              maxLength={4000}
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Logo URL">
              <Input
                value={form.logo_url}
                onChange={(e) => update("logo_url", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Cover image URL">
              <Input
                value={form.cover_image_url}
                onChange={(e) => update("cover_image_url", e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Official website">
              <Input
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Wikipedia URL">
              <Input
                value={form.wikipedia_url}
                onChange={(e) => update("wikipedia_url", e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/…"
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
