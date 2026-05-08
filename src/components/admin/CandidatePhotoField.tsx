import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Crop, Trash2, Link as LinkIcon, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "candidate-photos";
const OUTPUT_SIZE = 800; // px square

interface Props {
  candidateId?: string | null;
  value: string;
  onChange: (next: string) => void;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function cropToBlob(
  src: string,
  area: Area,
  rotation: number,
  size = OUTPUT_SIZE
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  if (rotation) {
    // Render rotated source onto a temp canvas first
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = img.width * cos + img.height * sin;
    const h = img.width * sin + img.height * cos;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    tctx.translate(w / 2, h / 2);
    tctx.rotate(rad);
    tctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.drawImage(tmp, area.x, area.y, area.width, area.height, 0, 0, size, size);
  } else {
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9)
  );
}

export function CandidatePhotoField({ candidateId, value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null); // data URL or remote URL being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onPicked = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditing(String(reader.result));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const startCropExisting = async () => {
    if (!value) return;
    // Use the existing URL — must be CORS-friendly. Supabase public buckets are.
    setEditing(value);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  const saveCrop = async () => {
    if (!editing || !pixels) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(editing, pixels, rotation);
      const folder = candidateId ?? "unassigned";
      const path = `${folder}/${Date.now()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Photo updated");
      setEditing(null);
      setPixels(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              <Upload className="h-3 w-3" /> Upload &amp; crop
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => void startCropExisting()}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                <Crop className="h-3 w-3" /> Re-crop
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="…or paste a photo URL"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
        />
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
        >
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h3 className="text-sm font-semibold">Crop photo (square)</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative h-80 w-full bg-muted">
              <Cropper
                image={editing}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="rect"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="space-y-2 px-4 py-3">
              <label className="flex items-center gap-2 text-xs">
                <span className="w-12 text-muted-foreground">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                >
                  <RotateCw className="h-3 w-3" /> Rotate 90°
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !pixels}
                    onClick={() => void saveCrop()}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save crop"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
