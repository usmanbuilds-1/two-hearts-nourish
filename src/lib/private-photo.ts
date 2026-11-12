import { supabase } from "@/integrations/supabase/client";

const BUCKET = "meal-photos";
const PUBLIC_PREFIX = "/storage/v1/object/public/meal-photos/";
const cache = new Map<string, { url: string; expires: number }>();

/** Both legacy public URLs and new storage-relative paths are supported. */
export function photoStoragePath(stored: string, roomId: string): string | null {
  let path = stored;
  if (/^https?:\/\//i.test(stored)) {
    try {
      const url = new URL(stored);
      const position = url.pathname.indexOf(PUBLIC_PREFIX);
      if (position < 0) return null;
      path = decodeURIComponent(url.pathname.slice(position + PUBLIC_PREFIX.length));
    } catch {
      return null;
    }
  }
  if (!/^[0-9a-f-]{36}\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(path)) return null;
  return path.startsWith(roomId + "/") ? path : null;
}

/** Only call this for a photo in the viewer's room; bucket RLS independently verifies it. */
export async function signedMealPhotoUrl(stored: string, roomId: string): Promise<string | null> {
  const path = photoStoragePath(stored, roomId);
  if (!path) return null;
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expires > now) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 180);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: now + 120_000 });
  return data.signedUrl;
}
