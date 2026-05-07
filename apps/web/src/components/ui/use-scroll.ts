"use client";

import React from "react";

export function useScroll(threshold: number) {
  const [scrolled, setScrolled] = React.useState(false);

  const onScroll = React.useCallback(() => {
    setScrolled(window.scrollY > threshold);
  }, [threshold]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(onScroll);
    const secondFrame = window.setTimeout(onScroll, 120);
    const settledFrame = window.setTimeout(onScroll, 500);

    window.addEventListener("scroll", onScroll);
    window.addEventListener("load", onScroll);
    window.addEventListener("pageshow", onScroll);
    window.addEventListener("resize", onScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(secondFrame);
      window.clearTimeout(settledFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", onScroll);
      window.removeEventListener("pageshow", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [onScroll]);

  return scrolled;
}
