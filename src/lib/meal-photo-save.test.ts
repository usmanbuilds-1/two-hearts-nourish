import { describe, it, expect, vi } from "vitest";
import { saveMealPhoto, saveMealPhotoWithServerFallback } from "./meal-photo-save";

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

  it("falls back to a member-authenticated server upload only when browser upload fails", async () => {
    const upload = vi.fn().mockResolvedValue(null);
    const attach = vi.fn();
    const server = vi.fn().mockResolvedValue({ ok: true, photoPath: "room-a/secure.jpg" });
    const result = await saveMealPhotoWithServerFallback(request, { upload, attach }, server);
    expect(result).toEqual({ ok: true, photoPath: "room-a/secure.jpg" });
    expect(server).toHaveBeenCalledWith("meal-1", request.compressedImage);
    expect(attach).not.toHaveBeenCalled();
  });

  it("does not duplicate an already uploaded object if attachment alone fails", async () => {
    const upload = vi.fn().mockResolvedValue("room-a/exists.jpg");
    const attach = vi.fn().mockResolvedValue({ ok: false });
    const server = vi.fn();
    const result = await saveMealPhotoWithServerFallback(request, { upload, attach }, server);
    expect(result).toEqual({ ok: false, failedAt: "attach", uploadedPath: "room-a/exists.jpg" });
    expect(server).not.toHaveBeenCalled();
  });

  it("keeps the same meal available for retry when both upload paths fail", async () => {
    const upload = vi.fn().mockResolvedValue(null);
    const attach = vi.fn();
    const server = vi.fn().mockResolvedValue({ ok: false, error: "UPLOAD_FAILED" });
    const result = await saveMealPhotoWithServerFallback(request, { upload, attach }, server);
    expect(result).toEqual({ ok: false, failedAt: "upload", uploadedPath: null });
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
