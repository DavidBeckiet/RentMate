"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: 0 | 1 | 2 | 3;
}

export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      setReady(true);
      return;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const bounds = element.getBoundingClientRect();
    if (bounds.top < viewportHeight * 0.88 && bounds.bottom > 0) {
      setVisible(true);
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    observer.observe(element);
    setReady(true);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={elementRef}
      className={`rm-reveal ${className}`}
      data-ready={ready}
      data-visible={visible}
      data-delay={delay}
    >
      {children}
    </div>
  );
}
