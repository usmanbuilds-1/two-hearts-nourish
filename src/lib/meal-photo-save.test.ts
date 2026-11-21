import { describe, it, expect, vi } from "vitest";
import { saveMealPhoto } from "./meal-photo-save";

describe("meal photo retention", () => {
  const request = { roomId: "room-a", mealId: "meal-1", compressedImage: "data:image/jpeg;base64,AA==" };

  it("uploads the real image and does not report success until attached", async () => {
    const upload = vi.fn().mockResolvedValue("room-a/photo.jpg");
    const attach = vi.fn().mockResolvedValue({ ok: true, photoPath: "room-a/photo.jpg" });
    const result = await saveMealPhoto(request, { upload, attach });
    expect(upload).toHaveBeenCalledWith(request.roomId, request.compressedImage);
    expect(attach).toHaveBeenCalledWith(request.mealId, "room-a/photo.jpg");
    expect(result).toEqual({ ok: true, photoPath: "room-a/photo.jpg" });
  });

  it("preserves the private uploaded path for a safe attach-only retry", async () => {
    const upload = vi.fn().mockResolvedValue("room-a/photo.jpg");
    const attach = vi.fn().mockResolvedValueOnce({ ok: false, error: "PHOTO_NOT_OWNED" })
      .mockResolvedValueOnce({ ok: true, photoPath: "room-a/photo.jpg" });
    const first = await saveMealPhoto(request, { upload, attach });
    expect(first).toEqual({ ok: false, failedAt: "attach", uploadedPath: "room-a/photo.jpg" });
    const retry = await saveMealPhoto({ ...request, uploadedPath: first.ok ? null : first.uploadedPath }, { upload, attach });
    expect(retry).toEqual({ ok: true, photoPath: "room-a/photo.jpg" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("does not pretend the photo was saved when its upload fails", async () => {
    const upload = vi.fn().mockResolvedValue(null);
    const attach = vi.fn();
    const result = await saveMealPhoto(request, { upload, attach });
    expect(result).toEqual({ ok: false, failedAt: "upload", uploadedPath: null });
    expect(attach).not.toHaveBeenCalled();
  });

  it("handles rejected storage calls without losing the path for retry", async () => {
    const upload = vi.fn().mockResolvedValue("room-a/photo.jpg");
    const attach = vi.fn().mockRejectedValue(new Error("network error"));
    expect(await saveMealPhoto(request, { upload, attach }))
      .toEqual({ ok: false, failedAt: "attach", uploadedPath: "room-a/photo.jpg" });
  });
});
