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

    if (
      (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) ||
      typeof IntersectionObserver === "undefined"
    ) {
      setVisible(true);
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        setReady(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8%", threshold: 0.12 }
    );

    observer.observe(element);
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
