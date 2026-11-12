import { useEffect, useState } from "react";
import { signedMealPhotoUrl } from "@/lib/private-photo";

type Props = {
  stored: string;
  roomId: string;
  alt?: string;
  className?: string;
};

export function usePrivateMealPhoto(stored: string | null | undefined, roomId: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (!stored) { if (active) setUrl(null); return; }
      const signed = await signedMealPhotoUrl(stored, roomId);
      if (active) setUrl(signed);
    }
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [stored, roomId]);
  return url;
}

export function PrivateMealPhoto({ stored, roomId, alt = "", className }: Props) {
  const url = usePrivateMealPhoto(stored, roomId);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : null;
}
