import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { formatBRL, previewUrl } from "@/lib/format";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Punctum" }] }),
  component: Admin,
});

/**
 * Cria uma versão de preview com marca d'água a partir de um File.
 * Reduz para no máximo 1200px e aplica texto repetido com baixa opacidade.
 */
async function buildWatermarkedPreview(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const maxW = 1200;
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  // Marca d'água diagonal repetida
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(w / 22)}px sans-serif`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 8);
  const text = "PUNCTUM · PREVIEW";
  const step = Math.round(w / 4);
  for (let y = -h; y < h; y += step) {
    for (let x = -w; x < w; x += step * 1.2) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.78));
}

function Admin() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  // form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("19.90");
  const [categoryId, setCategoryId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin]);

  const load = () => {
    supabase
      .from("photos")
      .select("id, title, price_cents, preview_path, published, category_id")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPhotos(data ?? []));
    supabase.from("categories").select("*").order("name").then(({ data }) => setCategories(data ?? []));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      toast.error("Selecione uma imagem e informe o título");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const baseName = `${crypto.randomUUID()}`;
      const originalPath = `${baseName}.${ext}`;
      const previewPath = `${baseName}.jpg`;

      // Upload original (privado)
      const { error: oErr } = await supabase.storage.from("photos-original").upload(originalPath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (oErr) throw oErr;

      // Cria preview com marca d'água e faz upload
      const previewBlob = await buildWatermarkedPreview(file);
      const { error: pErr } = await supabase.storage.from("photos-preview").upload(previewPath, previewBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (pErr) throw pErr;

      // Insere registro
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
      const { error: iErr } = await supabase.from("photos").insert({
        title,
        description: description || null,
        tags: tagArr,
        price_cents: priceCents,
        category_id: categoryId || null,
        preview_path: previewPath,
        original_path: originalPath,
        published: true,
      });
      if (iErr) throw iErr;

      toast.success("Foto publicada!");
      setFile(null);
      setTitle("");
      setDescription("");
      setTags("");
      setPrice("19.90");
      setCategoryId("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo: any) => {
    if (!confirm(`Excluir "${photo.title}"?`)) return;
    await supabase.storage.from("photos-preview").remove([photo.preview_path]);
    await supabase.storage.from("photos-original").remove([photo.original_path]);
    await supabase.from("photos").delete().eq("id", photo.id);
    load();
  };

  if (!user || !isAdmin) return null;

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="mb-8 font-display text-4xl font-semibold">Painel admin</h1>

      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        <Card className="p-6">
          <h2 className="mb-4 font-display text-xl font-semibold">Nova foto</h2>
          <form onSubmit={upload} className="space-y-4">
            <div>
              <Label htmlFor="file">Imagem original</Label>
              <Input id="file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
              <p className="mt-1 text-xs text-muted-foreground">O preview com marca d'água é gerado automaticamente.</p>
            </div>
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="desc">Descrição</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div>
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="natureza, montanha, pôr do sol" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="price">Preço (R$)</Label>
                <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="cat">Categoria</Label>
                <select
                  id="cat"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Enviando..." : "Publicar foto"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-4 font-display text-xl font-semibold">Catálogo ({photos.length})</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="aspect-[4/3] bg-muted">
                  <img src={previewUrl(supabaseUrl, p.preview_path)} alt={p.title} className="h-full w-full object-cover" />
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-primary">{formatBRL(p.price_cents)}</span>
                    <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
