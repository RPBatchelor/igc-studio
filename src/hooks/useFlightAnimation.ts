import { useEffect, useRef, useCallback } from "react";
import { useFlightStore } from "../stores/flightStore";

export function useFlightAnimation() {
  const { isPlaying, playbackSpeed, flightData, playbackTime, setPlaybackTime, setIsPlaying } =
    useFlightStore();
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const animate = useCallback(
    (now: number) => {
      if (!flightData || flightData.points.length === 0) return;

      const dt = lastFrameRef.current ? now - lastFrameRef.current : 0;
      lastFrameRef.current = now;

      const endTime = flightData.points[flightData.points.length - 1].timestamp;
      const newTime = playbackTime + dt * playbackSpeed;

      if (newTime >= endTime) {
        setPlaybackTime(endTime);
        setIsPlaying(false);
        return;
      }

      setPlaybackTime(newTime);
      rafRef.current = requestAnimationFrame(animate);
    },
    [isPlaying, playbackSpeed, flightData, playbackTime, setPlaybackTime, setIsPlaying]
  );

  useEffect(() => {
    if (isPlaying) {
      lastFrameRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, animate]);
}
