"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// The design's parallax ([data-speed], [data-px]) and scroll-reveal ([data-reveal]) effects.
export function MotionEffects() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const parallax = () => {
      raf = 0;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>("[data-speed],[data-px]").forEach((el) => {
        const isX = el.dataset.px != null;
        const host = isX ? el : (el.parentElement ?? el);
        const rect = host.getBoundingClientRect();
        if (rect.bottom < -300 || rect.top > vh + 300) return;
        const d = rect.top + rect.height / 2 - vh / 2;
        if (isX) el.style.translate = `${(d * parseFloat(el.dataset.px ?? "0")).toFixed(1)}px 0`;
        else el.style.translate = `0 ${(-d * parseFloat(el.dataset.speed ?? "0")).toFixed(1)}px`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(parallax);
    };
    const io = new IntersectionObserver((entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate([{ opacity: 0, transform: "translateY(32px)" }, { opacity: 1, transform: "none" }], { duration: 750, easing: "cubic-bezier(.2,.7,.2,1)" });
        io.unobserve(entry.target);
      }),
    );
    const timer = setTimeout(() => {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
      });
      parallax();
    }, 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(timer);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);
  return null;
}
