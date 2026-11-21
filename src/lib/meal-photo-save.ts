/**
 * Save an uploaded meal photo without exposing the storage URL publicly.
 * Returning an uploadedPath on attach failure lets retries reuse the original
 * private object instead of uploading duplicates. Never claim success until
 * the meal row has a persisted photo reference.
 */
export type PhotoSaveResult =
  | { ok: true; photoPath: string }
  | { ok: false; failedAt: "upload" | "attach"; uploadedPath: string | null };

type PhotoStorage = {
  upload: (roomId: string, compressedImage: string) => Promise<string | null>;
  attach: (mealId: string, uploadedPath: string) =>
    Promise<{ ok: boolean; photoPath?: string }>;
};

export async function saveMealPhoto(
  request: {
    roomId: string;
    mealId: string;
    compressedImage: string;
    uploadedPath?: string | null;
  },
  storage: PhotoStorage,
): Promise<PhotoSaveResult> {
  let uploadedPath = request.uploadedPath ?? null;
  if (!uploadedPath) {
    try {
      uploadedPath = await storage.upload(request.roomId, request.compressedImage);
    } catch {
      return { ok: false, failedAt: "upload", uploadedPath: null };
    }
    if (!uploadedPath) return { ok: false, failedAt: "upload", uploadedPath: null };
  }

  try {
    const attached = await storage.attach(request.mealId, uploadedPath);
    if (!attached.ok || !attached.photoPath)
      return { ok: false, failedAt: "attach", uploadedPath };
    return { ok: true, photoPath: attached.photoPath };
  } catch {
    return { ok: false, failedAt: "attach", uploadedPath };
  }
}

/**
 * Use the existing browser path first. If Storage rejects the upload, retry
 * through an authenticated server handler that checks the owning member and
 * meal before writing to the same private bucket. An attach-only failure
 * deliberately retains its existing uploaded path.
 */
export async function saveMealPhotoWithServerFallback(
  request: Parameters<typeof saveMealPhoto>[0],
  storage: PhotoStorage,
  serverUpload: (mealId: string, compressedImage: string) =>
    Promise<{ ok: boolean; photoPath?: string }>,
): Promise<PhotoSaveResult> {
  const result = await saveMealPhoto(request, storage);
  if (result.ok || result.failedAt !== "upload") return result;
  try {
    const serverResult = await serverUpload(request.mealId, request.compressedImage);
    if (serverResult.ok && serverResult.photoPath)
      return { ok: true, photoPath: serverResult.photoPath };
  } catch {
    // Retain same meal and photo for explicit user retry, never insert twice.
  }
  return result;
}
