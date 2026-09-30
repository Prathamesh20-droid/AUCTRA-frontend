import { useEffect, useRef } from "react";

export default function useSyncedTimer(socket, setTimeLeft) {
  const isPausedRef = useRef(false);

  useEffect(() => {
    // ⏱️ Smooth 1-second local countdown interval on the client
    const interval = setInterval(() => {
      if (!isPausedRef.current) {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);

    if (!socket) {
      return () => clearInterval(interval);
    }

    const handleTimerUpdate = (payload) => {
      if (!payload) return;

      const remaining = Number(
        payload.remaining_seconds ??
        payload.time_left ??
        payload.remaining ??
        0
      );

      if (!Number.isNaN(remaining)) {
        setTimeLeft(remaining);
      }
    };

    const handlePaused = (data) => {
      isPausedRef.current = true;
      const remaining = Number(
        data?.remaining_seconds ?? data?.remaining ?? 0
      );
      setTimeLeft(remaining);
    };

    const handleResumed = (data) => {
      isPausedRef.current = false;
      const remaining = Number(
        data?.remaining_seconds ?? data?.remaining ?? 0
      );
      setTimeLeft(remaining);
    };

    const handleStatus = (data) => {
      if (!data) return;
      isPausedRef.current = Boolean(data.paused);
      const remaining = Number(
        data?.remaining_seconds ?? data?.remaining ?? 0
      );
      if (!Number.isNaN(remaining)) {
        setTimeLeft(remaining);
      }
    };

    const handleStarted = (data) => {
      isPausedRef.current = false;
      const remaining = Number(data?.duration ?? 0);
      if (!Number.isNaN(remaining)) {
        setTimeLeft(remaining);
      }
    };

    const handleEnded = () => {
      isPausedRef.current = false;
      setTimeLeft(0);
    };

    const handleState = (data) => {
      if (data?.status === "no_active_auction") {
        isPausedRef.current = false;
        setTimeLeft(0);
      }
    };

    socket.on("auction_status", handleStatus);
    socket.on("auction_started", handleStarted);
    socket.on("timer_update", handleTimerUpdate);
    socket.on("auction_paused", handlePaused);
    socket.on("auction_resumed", handleResumed);
    socket.on("auction_ended", handleEnded);
    socket.on("auction_state", handleState);

    return () => {
      clearInterval(interval);
      socket.off("auction_status", handleStatus);
      socket.off("auction_started", handleStarted);
      socket.off("timer_update", handleTimerUpdate);
      socket.off("auction_paused", handlePaused);
      socket.off("auction_resumed", handleResumed);
      socket.off("auction_ended", handleEnded);
      socket.off("auction_state", handleState);
    };

  }, [socket, setTimeLeft]);
}