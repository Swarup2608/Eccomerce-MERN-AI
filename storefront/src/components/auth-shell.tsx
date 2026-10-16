"use client";

import Link from "next/link";
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Logo } from "@/components/header-bar";

const PHOTO = "https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1600&q=80";
const eyebrow = "text-xs uppercase tracking-[0.16em] text-accent-700";

// Editorial photo panel from the design's Login / Register screen: brand bar on top, headline card at the bottom,
// and a slight parallax as the pointer moves.
export function AuthArt({ title, blurb }: { title: ReactNode; blurb: string }) {
  const [shift, setShift] = useState({ x: 0, y: 0 });
  return (
    <div
      className="absolute inset-0 overflow-hidden border-x border-divider bg-surface"
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setShift({ x: ((event.clientX - box.left) / box.width - 0.5) * -24, y: ((event.clientY - box.top) / box.height - 0.5) * -24 });
      }}
      onMouseLeave={() => setShift({ x: 0, y: 0 })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PHOTO} alt="" className="absolute -left-[4%] -top-[4%] h-[108%] w-[108%] max-w-none object-cover transition-[translate] duration-900 ease-[var(--ease)] motion-reduce:transition-none" style={{ translate: `${shift.x}px ${shift.y}px` }} />
      <div className="relative flex h-full flex-col justify-between gap-6 p-10">
        <div className="flex items-center justify-between gap-4 bg-background px-4 py-3">
          <Link href={"/"} aria-label="Vektor home" className="no-underline">
            <Logo size={22} />
          </Link>
          <Link href={"/products"} className="vk-link text-[13px]">
            Back to shop →
          </Link>
        </div>
        <div className="flex max-w-[460px] flex-col gap-3 bg-background p-7">
          <span className={eyebrow}>Members · Vektor</span>
          <p className="m-0 font-heading text-[clamp(36px,4.4vw,60px)] font-semibold leading-none tracking-[-0.02em] [text-wrap:balance]">{title}</p>
          <p className="m-0 max-w-[360px] text-[15px] text-foreground/65">{blurb}</p>
        </div>
      </div>
    </div>
  );
}

function MobileBar() {
  return (
    <div className="flex items-center justify-between border-b border-divider px-6 py-4 lg:hidden">
      <Link href={"/"} aria-label="Vektor home" className="no-underline">
        <Logo size={20} />
      </Link>
      <Link href={"/products"} className="vk-link text-[13px]">
        Back to shop →
      </Link>
    </div>
  );
}

// Static split layout for the single-purpose auth pages (forgot / reset password, verify email).
export function AuthShell({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col lg:grid lg:min-h-[100svh] lg:grid-cols-2">
      <MobileBar />
      <aside className="relative hidden lg:block">
        <AuthArt title="Welcome back. Your bag is where you left it." blurb="Free returns, saved carts across devices and order tracking from independent makers." />
      </aside>
      <section className="flex items-center px-6 py-14 sm:px-[clamp(24px,6vw,96px)]">
        <div className="flex w-full max-w-[400px] flex-col gap-5">
          <div>
            <span className={eyebrow}>{step}</span>
            <h1 className="mb-1.5 mt-2 text-[40px] leading-none">{title}</h1>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

const SLIDE = "transition-transform duration-1000 ease-[cubic-bezier(.75,0,.2,1)] motion-reduce:transition-none";

// The design's sign in ⇄ register screen. Both forms live on one vertical track; switching slides the photo panel to
// the other side, the form column the opposite way, and the track up or down. The URL follows without a reload.
export function AuthSplit({ initial, login, register }: { initial: "login" | "register"; login: ReactNode; register: ReactNode }) {
  const [reg, setReg] = useState(initial === "register");

  function show(toRegister: boolean) {
    return (event: MouseEvent) => {
      event.preventDefault();
      setReg(toRegister);
      window.history.replaceState(window.history.state, "", (toRegister ? "/register" : "/login"));
      document.title = `${toRegister ? "Create an account" : "Sign in"} | Vektor`;
    };
  }

  const switchLink = (toRegister: boolean, text: string) => (
    <a href={(toRegister ? "/register" : "/login")} onClick={show(toRegister)} className="font-medium underline">
      {text}
    </a>
  );

  return (
    <main className="relative flex flex-1 flex-col lg:block lg:h-[100svh] lg:min-h-[720px] lg:overflow-hidden">
      <MobileBar />
      <div className={`absolute left-0 top-0 z-[2] hidden h-full w-1/2 lg:block ${SLIDE}`} style={{ transform: `translateX(${reg ? "100%" : "0%"})` }}>
        <AuthArt title={reg ? "Members see every new arrival first." : "Welcome back. Your bag is where you left it."} blurb="Free returns, saved carts across devices and order tracking from independent makers." />
      </div>
      <div className={`lg:absolute lg:left-1/2 lg:top-0 lg:h-full lg:w-1/2 lg:overflow-hidden lg:[transform:translateX(var(--fx))] ${SLIDE}`} style={{ "--fx": reg ? "-100%" : "0%" } as CSSProperties}>
        <div className={`lg:h-[200%] lg:[transform:translateY(var(--ty))] ${SLIDE} lg:delay-[80ms] lg:duration-[1100ms]`} style={{ "--ty": reg ? "-50%" : "0%" } as CSSProperties}>
          <section inert={reg} className={`${reg ? "hidden lg:flex" : "flex"} items-center overflow-y-auto px-6 py-12 sm:px-[clamp(24px,6vw,96px)] lg:h-1/2`}>
            <div className="flex w-full max-w-[400px] flex-col gap-5">
              <div>
                <span className={eyebrow}>01 / Sign in</span>
                <h1 className="mb-1.5 mt-2 text-[40px] leading-none">Sign in</h1>
                <p className="m-0 text-sm text-foreground/60">New to Vektor? {switchLink(true, "Create an account")}</p>
              </div>
              {login}
              <div className="flex items-center gap-3 text-xs text-foreground/55">
                <span className="h-px flex-1 bg-divider" />
                or
                <span className="h-px flex-1 bg-divider" />
              </div>
              <Link href={"/products"} className="self-start text-[13px]">
                Continue as guest →
              </Link>
            </div>
          </section>
          <section inert={!reg} className={`${reg ? "flex" : "hidden lg:flex"} items-center overflow-y-auto px-6 py-12 sm:px-[clamp(24px,6vw,96px)] lg:h-1/2`}>
            <div className="flex w-full max-w-[440px] flex-col gap-5">
              <div>
                <span className={eyebrow}>02 / Register</span>
                <h2 className="mb-1.5 mt-2 text-[40px] leading-none">Create account</h2>
                <p className="m-0 text-sm text-foreground/60">Already a member? {switchLink(false, "Sign in")}</p>
              </div>
              {register}
              <p className="m-0 text-xs text-foreground/55">By continuing you agree to the Terms and Privacy Policy.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
