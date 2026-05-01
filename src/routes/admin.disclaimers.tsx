import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useAllDisclaimers,
  useUpsertDisclaimer,
  useDeleteDisclaimer,
  type SiteDisclaimer,
} from "@/hooks/useDisclaimers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Plus, Pencil, Trash2, X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/disclaimers")({
  component: AdminDisclaimersPage,
});

interface PlacementOption {
  value: string;
  label: string;
  group: string;
}

const PLACEMENTS: PlacementOption[] = [
  { value: "global", label: "🌐 All Pages (Global Banner)", group: "Special" },
  { value: "home", label: "Home Page", group: "Main Pages" },
  { value: "candidates", label: "Candidates List", group: "Main Pages" },
  { value: "parties", label: "Parties List", group: "Main Pages" },
  { value: "districts", label: "Districts", group: "Main Pages" },
  { value: "sitting_mps", label: "Sitting MPs", group: "Main Pages" },
  { value: "proposals", label: "Proposals", group: "Main Pages" },
  { value: "compare", label: "Compare", group: "Main Pages" },
  { value: "ask", label: "Ask AI", group: "Main Pages" },
  { value: "search", label: "Search", group: "Main Pages" },
  { value: "resources", label: "Resources", group: "Main Pages" },
  { value: "faq", label: "Voting FAQ", group: "Main Pages" },
  { value: "my_district", label: "My District", group: "Main Pages" },
  { value: "candidate_detail", label: "Candidate Detail", group: "Detail Pages" },
  { value: "party_detail", label: "Party Detail", group: "Detail Pages" },
  { value: "about", label: "About", group: "Legal & Info" },
  { value: "contact", label: "Contact", group: "Legal & Info" },
  { value: "privacy", label: "Privacy", group: "Legal & Info" },
  { value: "terms", label: "Terms", group: "Legal & Info" },
  { value: "cookies", label: "Cookies", group: "Legal & Info" },
  { value: "accessibility", label: "Accessibility", group: "Legal & Info" },
  { value: "developers", label: "Developers / API", group: "Legal & Info" },
  { value: "changelog", label: "Changelog", group: "Legal & Info" },
];

function PlacementLabel({ value }: { value: string }) {
  const opt = PLACEMENTS.find((o) => o.value === value);
  return <>{opt?.label || value}</>;
}

function AdminDisclaimersPage() {
  const { data: disclaimers, isLoading } = useAllDisclaimers();
  const upsert = useUpsertDisclaimer();
  const remove = useDeleteDisclaimer();
  const [editing, setEditing] = useState<Partial<SiteDisclaimer> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<string, PlacementOption[]> = {};
    for (const opt of PLACEMENTS) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push(opt);
    }
    return groups;
  }, []);

  const openNew = () =>
    setEditing({
      id: "",
      title: "",
      message: "",
      variant: "warning",
      is_active: true,
      placement: [],
    });

  const save = () => {
    if (!editing?.id || !editing.title || !editing.message) return;
    upsert.mutate(editing as SiteDisclaimer, { onSuccess: () => setEditing(null) });
  };

  const togglePlacement = (val: string) => {
    if (!editing) return;
    const placements = editing.placement || [];
    setEditing({
      ...editing,
      placement: placements.includes(val)
        ? placements.filter((p) => p !== val)
        : [...placements, val],
    });
  };

  const removePlacement = (val: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      placement: (editing.placement || []).filter((p) => p !== val),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Disclaimers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage disclaimer banners shown across the public site.
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Add Disclaimer
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {disclaimers?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No disclaimers configured yet.
            </p>
          )}
          {disclaimers?.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{d.title}</span>
                    <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">
                      {d.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {d.variant}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{d.message}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.placement.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        <PlacementLabel value={p} />
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing({ ...d })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete disclaimer "${d.title}"?`)) remove.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.created_at ? "Edit Disclaimer" : "New Disclaimer"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>ID (unique key)</Label>
                <Input
                  value={editing.id || ""}
                  onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                  placeholder="e.g. election-week-notice"
                  disabled={!!editing.created_at}
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title || ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  value={editing.message || ""}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label>Variant</Label>
                <Select
                  value={editing.variant || "warning"}
                  onValueChange={(v) => setEditing({ ...editing, variant: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">Warning (amber)</SelectItem>
                    <SelectItem value="info">Info (blue)</SelectItem>
                    <SelectItem value="error">Error (red)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Where to show this disclaimer</Label>

                {(editing.placement?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editing.placement!.map((p) => (
                      <Badge key={p} variant="default" className="gap-1 pr-1">
                        <PlacementLabel value={p} />
                        <button
                          type="button"
                          onClick={() => removePlacement(p)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-primary-foreground/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="mt-2 w-full justify-between font-normal"
                    >
                      Search and select pages…
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search pages…" />
                      <CommandList className="max-h-64">
                        <CommandEmpty>No pages found.</CommandEmpty>
                        {Object.entries(grouped).map(([group, options]) => (
                          <CommandGroup key={group} heading={group}>
                            {options.map((opt) => {
                              const isSelected =
                                editing.placement?.includes(opt.value) || false;
                              return (
                                <CommandItem
                                  key={opt.value}
                                  value={`${opt.label} ${opt.value}`}
                                  onSelect={() => togglePlacement(opt.value)}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  {opt.label}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!editing?.id || !editing?.title || !editing?.message}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
