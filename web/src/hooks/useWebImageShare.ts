import { useCallback, useState } from "react";
import { canShareFiles, dataUrlToPngFile } from "../lib/shareExport";

interface ShareResult {
  success: boolean;
  error?: unknown;
}

interface ShareImageOptions {
  fileName?: string;
}

interface UseWebImageShareReturn {
  shareImage: (
    imageUrl: string,
    title?: string,
    text?: string,
    options?: ShareImageOptions,
  ) => Promise<ShareResult>;
  isSharing: boolean;
  canShare: boolean;
  isSecureContext: boolean;
}

/** Prefer `{ files, title, text }`, fall back to `{ files }` only; ignore AbortError. */
export function useWebImageShare(): UseWebImageShareReturn {
  const [isSharing, setIsSharing] = useState(false);

  const [{ canShare, isSecureContext }] = useState(() => ({
    canShare: canShareFiles(),
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
  }));

  const shareImage = useCallback(
    async (
      imageUrl: string,
      title = "Oracle d'accents",
      text = "",
      options: ShareImageOptions = {},
    ): Promise<ShareResult> => {
      setIsSharing(true);
      const { fileName = "share-image.png" } = options;
      try {
        if (typeof navigator.share !== "function") {
          return {
            success: false,
            error: new Error("Native share not supported"),
          };
        }

        const file = imageUrl.startsWith("data:")
          ? dataUrlToPngFile(imageUrl, fileName)
          : await (async () => {
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              const fileType = blob.type || "image/png";
              const extension = fileType.split("/")[1] || "png";
              return new File([blob], `share-image.${extension}`, {
                type: fileType,
              });
            })();

        const shareData: ShareData = { files: [file], title, text };
        const filesOnlyData: ShareData = { files: [file] };

        const canFilesOnly =
          typeof navigator.canShare === "function" ? navigator.canShare(filesOnlyData) : true;
        const canWithMeta =
          typeof navigator.canShare === "function" ? navigator.canShare(shareData) : false;

        const payload = canWithMeta ? shareData : filesOnlyData;
        await navigator.share(canFilesOnly ? payload : filesOnlyData);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Error sharing image:", error);
        }
        return { success: false, error };
      } finally {
        setIsSharing(false);
      }
    },
    [],
  );

  return { shareImage, isSharing, canShare, isSecureContext };
}
