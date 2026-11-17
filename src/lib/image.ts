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

/** Uploads to the private room bucket and returns the storage path, not a public URL. */
export async function uploadMealPhoto(roomId: string, dataUrl: string): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const name = `${roomId}/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from("meal-photos")
      .upload(name, blob, { contentType: "image/jpeg", cacheControl: "60" });

    if (error) { console.error("Storage upload failed", error); return null; }

    return name;
  } catch (err) {
    console.error("Photo upload error", err);
    return null;
  }
}


/** 64-bit dHash. It cannot reconstruct the photo and is used only in member-private scan cache. */
export async function perceptualImageHash(dataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    element.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("IMAGE_HASH_FAILED");
  ctx.drawImage(image, 0, 0, 9, 8);
  const pixels = ctx.getImageData(0, 0, 9, 8).data;
  const bits: number[] = [];
  const gray = (x: number, y: number) => {
    const at = (y * 9 + x) * 4;
    return pixels[at]! * 0.299 + pixels[at + 1]! * 0.587 + pixels[at + 2]! * 0.114;
  };
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits.push(gray(x, y) > gray(x + 1, y) ? 1 : 0);
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const value = bits[i]! * 8 + bits[i + 1]! * 4 + bits[i + 2]! * 2 + bits[i + 3]!;
    hex += value.toString(16);
  }
  return hex;
}

export async function contextFingerprint(text: string): Promise<string> {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
