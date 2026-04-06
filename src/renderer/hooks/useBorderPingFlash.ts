import { useEffect, useState } from "react";

export function useBorderPingFlash(): number {
  const [flashGen, setFlashGen] = useState(0);

  useEffect(() => {
    return window.electronApp.windowControls.onBorderPingFlash(() => {
      setFlashGen((g) => g + 1);
    });
  }, []);

  return flashGen;
}
