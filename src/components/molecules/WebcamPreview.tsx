import { useEffect, useRef } from "react";

import { Skeleton } from "@/components/ui/skeleton";

type MediaStreamPreviewProps = {
  readonly stream: MediaStream | null;
  readonly isLoading?: boolean;
  readonly unavailableLabel: string;
};

export function MediaStreamPreview({
  stream,
  isLoading = false,
  unavailableLabel,
}: MediaStreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.srcObject = stream;

    if (stream) {
      void videoElement.play().catch(() => {
        // Ignore autoplay failures; the preview will render once playback is allowed.
      });
    }

    return () => {
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
    };
  }, [stream]);

  if (!stream && isLoading) {
    return <Skeleton className="aspect-video w-full rounded-md" />;
  }

  if (!stream) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border/60 bg-background/40 text-xs text-muted-foreground">
        {unavailableLabel}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/50 bg-black/50">
      <video
        ref={videoRef}
        className="aspect-video w-full object-cover"
        autoPlay
        playsInline
        muted
      />
    </div>
  );
}
