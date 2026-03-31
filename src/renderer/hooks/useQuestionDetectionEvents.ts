import { useEffect } from "react";

import { useAppDispatch } from "../store/hooks";
import { questionDetected } from "../store/slices/questionSlice";

export function useQuestionDetectionEvents() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    return window.electronApp.questionDetectionEvents.onQuestionDetected(
      (payload) => {
        dispatch(questionDetected(payload));
      },
    );
  }, [dispatch]);
}
