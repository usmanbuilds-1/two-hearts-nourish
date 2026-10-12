/** Downscale + re-encode a photo in the browser before analysis. Nothing is stored. */
export async function compressImage(file: File, maxSide = 1024, quality = 0.78): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("IMAGE_LOAD_FAILED");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Converts a compressed data URL to a blob and uploads to Supabase Storage.
 *  Returns the public CDN URL, or null if the upload fails (non-blocking). */
export async function uploadMealPhoto(roomId: string, dataUrl: string): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const name = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;

    const { error } = await supabase.storage
      .from("meal-photos")
      .upload(name, blob, { contentType: "image/jpeg", cacheControl: "31536000" });

    if (error) { console.error("Storage upload failed", error); return null; }

    const { data } = supabase.storage.from("meal-photos").getPublicUrl(name);
    return data.publicUrl;
  } catch (err) {
    console.error("Photo upload error", err);
    return null;
  }
}
