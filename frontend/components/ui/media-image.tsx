"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./class-names";

export interface MediaImageProps extends Omit<ImageProps, "alt"> {
  readonly alt: string;
  readonly fallback?: ReactNode;
}

export function MediaImage({ alt, fallback, className, src, onError, ...props }: MediaImageProps) {
  const [failed, setFailed] = useState(false);
  const sourceKey = typeof src === "string" ? src : "src" in src ? src.src : src.default.src;

  useEffect(() => setFailed(false), [sourceKey]);

  if (failed) {
    return (
      fallback ?? (
        <div
          role="img"
          aria-label={alt}
          className="flex h-full w-full items-center justify-center bg-info-subtle text-info-foreground"
        >
          Không thể tải hình ảnh
        </div>
      )
    );
  }

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      className={cx("object-cover", className)}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
