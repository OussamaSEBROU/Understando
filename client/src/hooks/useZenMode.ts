import { useCallback, useEffect, useRef, useState } from "react";

const ZEN_AUTO_HIDE_MS = 2500;

export type ZenModeState = {
  controlsVisible: boolean;
  onPointerMove: () => void;
  onPointerLeave: () => void;
  onTapReveal: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onFocusCapture: () => void;
  onBlurCapture: () => void;
};

/**
 * Manages Zen Mode auto-hide behavior for player controls.
 *
 * Controls are hidden by default during playback.
 * - Pointer movement / touch tap reveals controls temporarily.
 * - Controls stay visible while actively interacting (dragging, menu open).
 * - Controls stay visible while any child has keyboard focus.
 * - Auto-hides after ZEN_AUTO_HIDE_MS of inactivity.
 */
export function useZenMode(enabled: boolean): ZenModeState {
  const [controlsVisible, setControlsVisible] = useState(!enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactingRef = useRef(false);
  const focusedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimer();
    if (!enabled) return;
    timerRef.current = setTimeout(() => {
      if (!interactingRef.current && !focusedRef.current) {
        setControlsVisible(false);
      }
    }, ZEN_AUTO_HIDE_MS);
  }, [clearTimer, enabled]);

  const reveal = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // When Zen mode is toggled, reset state.
  useEffect(() => {
    if (!enabled) {
      setControlsVisible(true);
      clearTimer();
    } else {
      setControlsVisible(false);
    }
    return clearTimer;
  }, [enabled, clearTimer]);

  const onPointerMove = useCallback(() => {
    if (enabled) reveal();
  }, [enabled, reveal]);

  const onPointerLeave = useCallback(() => {
    if (enabled && !interactingRef.current && !focusedRef.current) {
      scheduleHide();
    }
  }, [enabled, scheduleHide]);

  const onTapReveal = useCallback(() => {
    if (enabled) reveal();
  }, [enabled, reveal]);

  const onInteractionStart = useCallback(() => {
    interactingRef.current = true;
    clearTimer();
    setControlsVisible(true);
  }, [clearTimer]);

  const onInteractionEnd = useCallback(() => {
    interactingRef.current = false;
    if (enabled) scheduleHide();
  }, [enabled, scheduleHide]);

  const onFocusCapture = useCallback(() => {
    focusedRef.current = true;
    clearTimer();
    setControlsVisible(true);
  }, [clearTimer]);

  const onBlurCapture = useCallback(() => {
    focusedRef.current = false;
    if (enabled && !interactingRef.current) scheduleHide();
  }, [enabled, scheduleHide]);

  return {
    controlsVisible,
    onPointerMove,
    onPointerLeave,
    onTapReveal,
    onInteractionStart,
    onInteractionEnd,
    onFocusCapture,
    onBlurCapture,
  };
}
