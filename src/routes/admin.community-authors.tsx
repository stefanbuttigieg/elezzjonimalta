import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ExternalLink, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/community-authors")({
  component: AdminCommunityAuthorsPage,
});

type Kind = Database["public"]["Enums"]["community_author_kind"];
type Status = Database["public"]["Enums"]["review_status"];

type Author = {
  id: string;
  slug: string;
  name: string;
  kind: Kind;
  bio_en: string | null;
  bio_mt: string | null;
  logo_url: string | null;
  website: string | null;
  source_url: string | null;
  status: Status;
};

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "ngo", label: "NGO" },
  { value: "union", label: "Union" },
  { value: "business", label: "Business / Chamber" },
  { value: "academic", label: "Academic" },
  { value: "faith", label: "Faith group" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const EMPTY: Partial<Author> = {
  slug: "",
  name: "",
  kind: "ngo",
  bio_en: "",
  bio_mt: "",
  logo_url: "",
  website: "",
  source_url: "",
  status: "pending_review",
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function AdminCommunityAuthorsPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<Author> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("community_authors")
      .select("*")
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Author[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing) return;
    const name = editing.name?.trim() ?? "";
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      slug: editing.slug?.trim() || slugify(name),
      name,
      kind: (editing.kind ?? "ngo") as Kind,
      bio_en: editing.bio_en?.trim() || null,
      bio_mt: editing.bio_mt?.trim() || null,
      logo_url: editing.logo_url?.trim() || null,
      website: editing.website?.trim() || null,
      source_url: editing.source_url?.trim() || null,
      status: (editing.status ?? "pending_review") as Status,
    };
    setSaving(true);
    const { error } = editing.id
      ? await supabase.from("community_authors").update(payload).eq("id", editing.id)
      : await supabase.from("community_authors").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setEditing(null);
    void load();
  };

  const remove = async (a: Author) => {
    if (!confirm(`Delete "${a.name}"? This will also delete all of their community proposals.`)) return;
    const { error } = await supabase.from("community_authors").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Community authors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            NGOs, individuals, unions and other entities whose election wishlists you publish.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/community-proposals">Community proposals</Link>
          </Button>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })} className="gap-1">
            <Plus className="h-4 w-4" /> New author
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No community authors yet.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {a.logo_url ? (
                      <img src={a.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{a.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {KIND_OPTIONS.find((k) => k.value === a.kind)?.label ?? a.kind}
                      </Badge>
                      <Badge
                        variant={a.status === "published" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {a.status}
                      </Badge>
                    </div>
                    {a.website ? (
                      <a
                        href={a.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {a.website} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    {a.bio_en ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.bio_en}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...a })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {isAdmin ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void remove(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit author" : "New community author"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name *</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Moviment Graffitti"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="auto from name"
                />
              </div>
              <div>
                <Label>Kind</Label>
                <Select value={editing.kind ?? "ngo"} onValueChange={(v) => setEditing({ ...editing, kind: v as Kind })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={editing.website ?? ""}
                  onChange={(e) => setEditing({ ...editing, website: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input
                  value={editing.logo_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Source URL</Label>
                <Input
                  value={editing.source_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, source_url: e.target.value })}
                  placeholder="Wishlist / press release / official statement"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Bio (EN)</Label>
                <Textarea
                  rows={3}
                  value={editing.bio_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio_en: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Bio (MT)</Label>
                <Textarea
                  rows={3}
                  value={editing.bio_mt ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio_mt: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Status</Label>
                <Select
                  value={editing.status ?? "pending_review"}
                  onValueChange={(v) => setEditing({ ...editing, status: v as Status })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
