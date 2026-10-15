"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface HeroSlide {
  img: string;
  alt: string;
  kicker: string;
  words: string[];
  outline: string;
  sub: string;
  cta: string;
  href: string;
}

const arrow = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const glass = "rgba(255,255,255,.14)";

// Full-bleed hero from the redesign: autoplays every 7s (paused on hover, focus or reduced motion), words rise in on
// each slide, last word outlined.
export function HeroSlider({ slides, secondary }: { slides: HeroSlide[]; secondary: { label: string; href: string } }) {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const slide = slides[index] ?? slides[0];

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!paused.current && !document.hidden) setIndex((current) => (current + 1) % slides.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (!slide) return null;
  const go = (by: number) => setIndex((index + by + slides.length) % slides.length);

  return (
    <div
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
      aria-roledescription="carousel"
      style={{ position: "relative", height: "calc(100svh - 150px)", minHeight: 560, maxHeight: 880, borderRadius: "var(--box-r,0px)", overflow: "hidden", background: "var(--color-neutral-800)" }}
    >
      <span data-speed="0.16" style={{ position: "absolute", left: 0, right: 0, top: "-8%", bottom: "-8%", display: "block" }}>
        <span key={slide.img} role="img" aria-label={slide.alt} className="vk3-hero-img" style={{ position: "absolute", inset: 0, display: "block", background: `var(--color-neutral-800) url(${slide.img}) center 30%/cover no-repeat` }} />
      </span>
      <span aria-hidden style={{ position: "absolute", inset: 0, display: "block", background: "linear-gradient(90deg,rgba(12,12,12,.62) 0%,rgba(12,12,12,.28) 48%,rgba(12,12,12,0) 72%),linear-gradient(0deg,rgba(12,12,12,.45) 0%,rgba(12,12,12,0) 35%)" }} />
      <div data-px="-0.3" aria-hidden style={{ position: "absolute", left: "2%", bottom: "-.14em", whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(120px,20vw,320px)", lineHeight: 1, letterSpacing: "-.05em", color: "rgba(255,255,255,.14)", pointerEvents: "none" }}>
        VEKTOR · NEW DROP · VEKTOR
      </div>
      <div key={index} aria-live="polite" style={{ position: "absolute", left: "clamp(24px,4vw,56px)", top: "clamp(28px,6vh,72px)", right: 24, maxWidth: 760, display: "flex", flexDirection: "column", gap: 22, color: "#fff" }}>
        <span className="vk3-fade" style={{ animationDelay: "420ms", whiteSpace: "nowrap", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500, background: glass, border: "1px solid rgba(255,255,255,.28)", backdropFilter: "blur(10px)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-accent)" }} />
          {slide.kicker}
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(44px,6.8vw,112px)", lineHeight: 0.95, letterSpacing: "-.04em", fontWeight: 700, color: "#fff", textTransform: "uppercase" }}>
          {[...slide.words, slide.outline].map((word, i) => (
            <span key={`${word}-${i}`} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: ".08em", marginRight: ".22em" }}>
              <span className="vk3-word" style={{ animationDelay: `${60 + i * 75}ms`, color: i === slide.words.length ? "transparent" : "#fff", WebkitTextStroke: i === slide.words.length ? "2px #fff" : undefined }}>
                {word}
              </span>
            </span>
          ))}
        </h1>
        <p className="vk3-fade" style={{ animationDelay: "510ms", margin: 0, fontSize: 18, lineHeight: 1.5, maxWidth: 440, color: "rgba(255,255,255,.86)" }}>
          {slide.sub}
        </p>
        <div className="vk3-fade" style={{ animationDelay: "600ms", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href={slide.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <span style={{ display: "inline-flex", alignItems: "center", minHeight: 54, padding: "0 28px", borderRadius: 999, background: "#fff", color: "#141414", fontSize: 16, fontWeight: 600, whiteSpace: "nowrap" }}>{slide.cta}</span>
            <span style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 999, background: "#fff", color: "#141414" }}>{arrow("M7 17 17 7M8 7h9v9")}</span>
          </Link>
          <Link href={secondary.href} style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", minHeight: 54, padding: "0 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,.45)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16, fontWeight: 500, textDecoration: "none", backdropFilter: "blur(10px)" }}>
            {secondary.label}
          </Link>
        </div>
      </div>
      {slides.length > 1 ? (
        <>
          <div style={{ position: "absolute", top: "clamp(28px,6vh,72px)", right: "clamp(20px,3vw,40px)", display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
            <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
              0{index + 1} / 0{slides.length}
            </span>
            <button type="button" onClick={() => go(-1)} aria-label="Previous slide" style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 999, border: "1px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", backdropFilter: "blur(10px)" }}>
              {arrow("m15 18-6-6 6-6")}
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next slide" style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 999, border: 0, background: "#fff", color: "#141414", cursor: "pointer" }}>
              {arrow("m9 18 6-6-6-6")}
            </button>
          </div>
          <div style={{ position: "absolute", left: "50%", bottom: "clamp(28px,4.5vh,50px)", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
            {slides.map((item, i) => (
              <button key={item.img} type="button" onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`} aria-current={i === index} style={{ width: i === index ? 36 : 10, height: 4, border: 0, padding: 0, borderRadius: 4, cursor: "pointer", background: i === index ? "#fff" : "rgba(255,255,255,.45)", transition: "width .5s cubic-bezier(.2,.7,.2,1),background-color .3s" }} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Horizontal snap rail with round previous / next buttons in the heading row.
export function Rail({ title, eyebrow, action, width = "minmax(260px,310px)", children }: { title: string; eyebrow?: string; action?: ReactNode; width?: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          {eyebrow ? <div style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 60%,transparent)", marginBottom: 8 }}>{eyebrow}</div> : null}
          <h2 style={{ margin: 0, fontSize: "clamp(36px,4vw,60px)", lineHeight: 1, letterSpacing: "-.03em" }}>{title}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="vk3-round" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            {arrow("m15 18-6-6 6-6")}
          </button>
          <button type="button" className="vk3-round" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            {arrow("m9 18 6-6-6-6")}
          </button>
          {action}
        </div>
      </div>
      <div ref={rail} className="vk3-rail" style={{ gridAutoColumns: width }}>
        {children}
      </div>
    </>
  );
}

// Category picker + search row above the arrivals rail. Chips are links (?cat=) so the rail is filtered server side.
export function HomeSearch() {
  const [q, setQ] = useState("");
  return (
    <form role="search" action="/v1/products" style={{ position: "relative", flex: "1 1 220px", maxWidth: 380 }}>
      <input className="input" type="search" name="q" maxLength={100} aria-label="Search products" placeholder="Search products, brands…" value={q} onChange={(event) => setQ(event.target.value)} style={{ background: "var(--color-surface)", borderColor: "transparent", paddingRight: 44 }} />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", opacity: 0.6, pointerEvents: "none" }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </form>
  );
}
