import { useEffect, useState } from 'react';

// True when the element is above the top of the screen (scrolled past). Give the returned callback
// to the element as its `ref`. Old browsers and the test runner have no IntersectionObserver: then
// the value stays false.
export function useScrolledPast<T extends Element>() {
  const [el, setEl] = useState<T | null>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  // With no element (for example the tiles are not on the screen), nothing is scrolled past.
  return [setEl, !!el && past] as const;
}
