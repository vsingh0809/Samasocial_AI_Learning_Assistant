import { useEffect, useRef } from "react";

export function useAutoScroll<T>(dependency: T) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [dependency]);

  return ref;
}
