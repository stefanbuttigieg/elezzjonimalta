import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Link2, X, ExternalLink, Search, Sparkles } from "lucide-react";
import { CommunityImportDrawer } from "@/components/admin/CommunityImportDrawer";
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

export const Route = createFileRoute("/admin/community-proposals")({
  component: AdminCommunityProposalsPage,
});

type Status = Database["public"]["Enums"]["review_status"];

type AuthorOpt = { id: string; name: string; status: Status };

type PartyProp = {
  id: string;
  title_en: string;
  party: { short_name: string | null; name_en: string } | null;
};

type Row = {
  id: string;
  author_id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  source_url: string | null;
  status: Status;
  sort_order: number;
  author: { id: string; name: string } | null;
  links: { party_proposal_id: string; party_proposal: PartyProp | null }[];
};

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const EMPTY: Partial<Row> = {
  title_en: "",
  title_mt: "",
  description_en: "",
  description_mt: "",
  category: "",
  source_url: "",
  status: "pending_review",
  sort_order: 0,
};

function AdminCommunityProposalsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [authors, setAuthors] = useState<AuthorOpt[]>([]);
  const [allParty, setAllParty] = useState<PartyProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<Row> & { id?: string }) | null>(null);
  const [editingLinks, setEditingLinks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [linkSearch, setLinkSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [rowsRes, authorsRes, partyRes] = await Promise.all([
      supabase
        .from("community_proposals")
        .select(
          "id,author_id,title_en,title_mt,description_en,description_mt,category,source_url,status,sort_order," +
            "author:community_authors(id,name)," +
            "links:community_proposal_links(party_proposal_id, party_proposal:proposals(id,title_en,party:parties(short_name,name_en)))",
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase.from("community_authors").select("id,name,status").order("name"),
      supabase
        .from("proposals")
        .select("id,title_en,party:parties(short_name,name_en)")
        .is("merged_into_id", null)
        .order("title_en"),
    ]);
    if (rowsRes.error) toast.error(rowsRes.error.message);
    if (authorsRes.error) toast.error(authorsRes.error.message);
    if (partyRes.error) toast.error(partyRes.error.message);
    setRows((rowsRes.data ?? []) as unknown as Row[]);
    setAuthors((authorsRes.data ?? []) as AuthorOpt[]);
    setAllParty((partyRes.data ?? []) as unknown as PartyProp[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditing({ ...EMPTY, author_id: authors[0]?.id ?? "" });
    setEditingLinks([]);
  };
  const openEdit = (r: Row) => {
    setEditing({ ...r });
    setEditingLinks(r.links.map((l) => l.party_proposal_id));
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.author_id) {
      toast.error("Please select an author");
      return;
    }
    if (!editing.title_en?.trim()) {
      toast.error("English title is required");
      return;
    }
    const payload = {
      author_id: editing.author_id,
      title_en: editing.title_en.trim(),
      title_mt: editing.title_mt?.trim() || null,
      description_en: editing.description_en?.trim() || null,
      description_mt: editing.description_mt?.trim() || null,
      category: editing.category?.trim() || null,
      source_url: editing.source_url?.trim() || null,
      status: (editing.status ?? "pending_review") as Status,
      sort_order: editing.sort_order ?? 0,
    };
    setSaving(true);
    let id = editing.id;
    if (id) {
      const { error } = await supabase.from("community_proposals").update(payload).eq("id", id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("community_proposals")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error(error?.message ?? "Insert failed");
        return;
      }
      id = data.id;
    }
    // Sync links: replace by deleting all then inserting selected.
    const { error: delErr } = await supabase
      .from("community_proposal_links")
      .delete()
      .eq("community_proposal_id", id!);
    if (delErr) {
      setSaving(false);
      toast.error(delErr.message);
      return;
    }
    if (editingLinks.length > 0) {
      const insertRows = editingLinks.map((pid) => ({
        community_proposal_id: id!,
        party_proposal_id: pid,
      }));
      const { error: insErr } = await supabase
        .from("community_proposal_links")
        .insert(insertRows);
      if (insErr) {
        setSaving(false);
        toast.error(insErr.message);
        return;
      }
    }
    setSaving(false);
    toast.success("Saved");
    setEditing(null);
    setEditingLinks([]);
    void load();
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete community proposal "${r.title_en}"?`)) return;
    const { error } = await supabase.from("community_proposals").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    void load();
  };

  const filteredRows = useMemo(
    () => (filterAuthor === "all" ? rows : rows.filter((r) => r.author_id === filterAuthor)),
    [rows, filterAuthor],
  );

  const partyMatches = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return allParty.slice(0, 50);
    return allParty
      .filter(
        (p) =>
          p.title_en.toLowerCase().includes(q) ||
          (p.party?.name_en?.toLowerCase().includes(q) ?? false) ||
          (p.party?.short_name?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 50);
  }, [allParty, linkSearch]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Community proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wishlist items submitted by NGOs, individuals, and other entities. Link each one to
            the party proposals it most aligns with.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/community-authors">Manage authors</Link>
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1" disabled={authors.length === 0}>
            <Plus className="h-4 w-4" /> New proposal
          </Button>
        </div>
      </div>

      {authors.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Add a community author first.{" "}
            <Link to="/admin/community-authors" className="underline">
              Go to authors
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filter by author</Label>
          <Select value={filterAuthor} onValueChange={setFilterAuthor}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All authors</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filteredRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No community proposals yet.</p>
      ) : (
        <div className="grid gap-3">
          {filteredRows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{r.title_en}</span>
                    <Badge variant={r.status === "published" ? "default" : "secondary"} className="text-[10px]">
                      {r.status}
                    </Badge>
                    {r.category ? (
                      <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by <span className="font-medium text-foreground">{r.author?.name ?? "—"}</span>
                  </p>
                  {r.description_en ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description_en}</p>
                  ) : null}
                  {r.links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Link2 className="h-3 w-3" /> {r.links.length} party proposal
                        {r.links.length === 1 ? "" : "s"}:
                      </span>
                      {r.links.slice(0, 4).map((l) =>
                        l.party_proposal ? (
                          <Badge key={l.party_proposal_id} variant="outline" className="text-[10px]">
                            {l.party_proposal.party?.short_name ?? "?"} · {l.party_proposal.title_en.slice(0, 40)}
                          </Badge>
                        ) : null,
                      )}
                      {r.links.length > 4 ? (
                        <span className="text-[11px] text-muted-foreground">+{r.links.length - 4}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {r.source_url ? (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                      title="Open source"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
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
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit community proposal" : "New community proposal"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Author *</Label>
                <Select
                  value={editing.author_id ?? ""}
                  onValueChange={(v) => setEditing({ ...editing, author_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an author…" />
                  </SelectTrigger>
                  <SelectContent>
                    {authors.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.status !== "published" ? `(${a.status})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Title (EN) *</Label>
                <Input
                  value={editing.title_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, title_en: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Title (MT)</Label>
                <Input
                  value={editing.title_mt ?? ""}
                  onChange={(e) => setEditing({ ...editing, title_mt: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description (EN)</Label>
                <Textarea
                  rows={3}
                  value={editing.description_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, description_en: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description (MT)</Label>
                <Textarea
                  rows={3}
                  value={editing.description_mt ?? ""}
                  onChange={(e) => setEditing({ ...editing, description_mt: e.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={editing.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="e.g. Housing"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Source URL</Label>
                <Input
                  value={editing.source_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, source_url: e.target.value })}
                  placeholder="Wishlist document, press release, social post…"
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

              <div className="sm:col-span-2 mt-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" /> Linked party proposals ({editingLinks.length})
                  </Label>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                    placeholder="Search party proposals to link…"
                    className="pl-7"
                  />
                </div>
                {editingLinks.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editingLinks.map((id) => {
                      const p = allParty.find((x) => x.id === id);
                      return (
                        <Badge key={id} variant="default" className="gap-1 pr-1 text-[11px]">
                          {p?.party?.short_name ?? "?"} · {p?.title_en?.slice(0, 50) ?? id}
                          <button
                            type="button"
                            onClick={() => setEditingLinks(editingLinks.filter((x) => x !== id))}
                            className="ml-1 rounded-full p-0.5 hover:bg-background/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                  {partyMatches.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No matches.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {partyMatches.map((p) => {
                        const selected = editingLinks.includes(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() =>
                                selected
                                  ? setEditingLinks(editingLinks.filter((x) => x !== p.id))
                                  : setEditingLinks([...editingLinks, p.id])
                              }
                              className={
                                "flex w-full items-start justify-between gap-2 p-2 text-left text-xs hover:bg-accent " +
                                (selected ? "bg-primary/5" : "")
                              }
                            >
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{p.title_en}</span>
                                <span className="block text-[10px] text-muted-foreground">
                                  {p.party?.name_en ?? "—"}
                                </span>
                              </span>
                              <span className="shrink-0 text-[10px] font-semibold text-primary">
                                {selected ? "Linked" : "Link"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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
