import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  RESOURCE_ICONS,
  RESOURCE_ICON_OPTIONS,
  type ResourceIcon,
} from "@/lib/resourceIcons";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/resources")({
  component: AdminResourcesPage,
});

type Resource = {
  id: string;
  slug: string;
  url: string;
  host: string;
  icon: ResourceIcon;
  tag_en: string;
  tag_mt: string;
  title_en: string;
  title_mt: string;
  description_en: string;
  description_mt: string;
  sort_order: number;
  is_published: boolean;
};

const EMPTY: Omit<Resource, "id"> & { id?: string } = {
  slug: "",
  url: "",
  host: "",
  icon: "globe",
  tag_en: "",
  tag_mt: "",
  title_en: "",
  title_mt: "",
  description_en: "",
  description_mt: "",
  sort_order: 0,
  is_published: true,
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

function deriveHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function AdminResourcesPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<Resource> & { id?: string }) | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_resources")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Resource[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => setEditing({ ...EMPTY });
  const openEdit = (r: Resource) => setEditing({ ...r });

  const save = async () => {
    if (!editing) return;
    const payload = {
      slug: editing.slug?.trim() || slugify(editing.title_en || editing.url || ""),
      url: editing.url?.trim() ?? "",
      host: editing.host?.trim() || deriveHost(editing.url ?? ""),
      icon: (editing.icon ?? "globe") as ResourceIcon,
      tag_en: editing.tag_en ?? "",
      tag_mt: editing.tag_mt ?? "",
      title_en: editing.title_en?.trim() ?? "",
      title_mt: editing.title_mt ?? "",
      description_en: editing.description_en ?? "",
      description_mt: editing.description_mt ?? "",
      sort_order: editing.sort_order ?? 0,
      is_published: editing.is_published ?? true,
    };
    if (!payload.url || !payload.title_en || !payload.slug) {
      toast.error("URL, title and slug are required");
      return;
    }
    setSaving(true);
    const { error } = editing.id
      ? await supabase.from("site_resources").update(payload).eq("id", editing.id)
      : await supabase.from("site_resources").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setEditing(null);
    void load();
  };

  const remove = async (r: Resource) => {
    if (!confirm(`Delete "${r.title_en}"?`)) return;
    const { error } = await supabase.from("site_resources").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    void load();
  };

  const togglePublished = async (r: Resource) => {
    const { error } = await supabase
      .from("site_resources")
      .update({ is_published: !r.is_published })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage external links shown on the public Resources page.
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1">
          <Plus className="h-4 w-4" /> Add resource
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No resources yet.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const Icon = RESOURCE_ICONS[r.icon] ?? RESOURCE_ICONS.globe;
            return (
              <Card key={r.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{r.title_en}</span>
                        <Badge
                          variant={r.is_published ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {r.is_published ? "Published" : "Hidden"}
                        </Badge>
                        {r.tag_en ? (
                          <Badge variant="outline" className="text-[10px]">
                            {r.tag_en}
                          </Badge>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          #{r.sort_order}
                        </span>
                      </div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {r.host} <ExternalLink className="h-3 w-3" />
                      </a>
                      {r.description_en ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {r.description_en}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={r.is_published}
                      onCheckedChange={() => void togglePublished(r)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => void remove(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit resource" : "New resource"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>URL *</Label>
                <Input
                  value={editing.url ?? ""}
                  onChange={(e) => {
                    const url = e.target.value;
                    setEditing({
                      ...editing,
                      url,
                      host: editing.host || deriveHost(url),
                    });
                  }}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <Label>Host</Label>
                <Input
                  value={editing.host ?? ""}
                  onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                  placeholder="example.com"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="auto from title"
                />
              </div>
              <div>
                <Label>Icon</Label>
                <Select
                  value={editing.icon ?? "globe"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, icon: v as ResourceIcon })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_ICON_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Title (EN) *</Label>
                <Input
                  value={editing.title_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, title_en: e.target.value })}
                />
              </div>
              <div>
                <Label>Title (MT)</Label>
                <Input
                  value={editing.title_mt ?? ""}
                  onChange={(e) => setEditing({ ...editing, title_mt: e.target.value })}
                />
              </div>
              <div>
                <Label>Tag (EN)</Label>
                <Input
                  value={editing.tag_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, tag_en: e.target.value })}
                  placeholder="e.g. News"
                />
              </div>
              <div>
                <Label>Tag (MT)</Label>
                <Input
                  value={editing.tag_mt ?? ""}
                  onChange={(e) => setEditing({ ...editing, tag_mt: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description (EN)</Label>
                <Textarea
                  rows={3}
                  value={editing.description_en ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description_en: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description (MT)</Label>
                <Textarea
                  rows={3}
                  value={editing.description_mt ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description_mt: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  checked={editing.is_published ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_published: v })}
                />
                <Label>Published</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
