"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

// Promise-based replacements for window.confirm / window.prompt, rendered by <DialogHost /> in the root layout:
//   if (!(await confirmDialog({ title: "Delete this address?" }))) return;
// Built on the native <dialog> element, which traps focus, closes on Escape and restores focus afterwards.

interface BaseOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // "danger" paints the confirm button in the accent colour for destructive actions.
  tone?: "default" | "danger";
}

export interface PromptOptions extends BaseOptions {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
  // Returns an error message to keep the dialog open, or null to accept the value.
  validate?: (value: string) => string | null;
}

type Request = ({ kind: "confirm" } & BaseOptions & { resolve: (ok: boolean) => void }) | ({ kind: "prompt" } & PromptOptions & { resolve: (value: string | null) => void });

let current: Request | null = null;
const listeners = new Set<() => void>();

function open(request: Request) {
  // A second dialog while one is open cancels the first, so no promise is left hanging.
  if (current) settle(null);
  current = request;
  listeners.forEach((listener) => listener());
}

function settle(value: string | boolean | null) {
  const request = current;
  if (!request) return;
  current = null;
  listeners.forEach((listener) => listener());
  if (request.kind === "confirm") request.resolve(value === true);
  else request.resolve(typeof value === "string" ? value : null);
}

export function confirmDialog(options: BaseOptions): Promise<boolean> {
  return new Promise((resolve) => open({ kind: "confirm", ...options, resolve }));
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => open({ kind: "prompt", ...options, resolve }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function DialogHost() {
  const request = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="vk-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        settle(null);
      }}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on its children.
      onClick={(event) => event.target === event.currentTarget && settle(null)}
      className="vk-dialog m-auto w-[min(440px,calc(100vw-32px))] border border-divider bg-background p-0 text-foreground shadow-[0_18px_44px_-12px_rgb(22_21_20/0.28)]"
    >
      {request ? <DialogBody key={request.title + request.kind} request={request} /> : null}
    </dialog>
  );
}

function DialogBody({ request }: { request: Request }) {
  const [value, setValue] = useState(request.kind === "prompt" ? (request.defaultValue ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const danger = request.tone === "danger";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (request.kind === "confirm") return settle(true);
    const problem = request.validate?.(value) ?? null;
    if (problem) return setError(problem);
    settle(value);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className={`mt-2 size-2.5 flex-none rotate-45 border-2 ${danger ? "border-accent bg-accent" : "border-accent"}`} />
        <div className="flex flex-col gap-2">
          <h2 id="vk-dialog-title" className="m-0 font-heading text-2xl font-semibold leading-tight tracking-[-0.02em]">
            {request.title}
          </h2>
          {request.message ? <p className="m-0 text-sm text-foreground/65">{request.message}</p> : null}
        </div>
      </div>
      {request.kind === "prompt" ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{request.label}</span>
          <input
            autoFocus
            value={value}
            inputMode={request.inputMode}
            placeholder={request.placeholder}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            className="min-h-11 border border-foreground/25 bg-background px-3 text-[15px] outline-none hover:border-foreground/50"
          />
          {error ? (
            <span role="alert" className="text-xs text-accent-700">
              {error}
            </span>
          ) : null}
        </label>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2.5 border-t border-divider pt-5">
        <button type="button" onClick={() => settle(null)} className="inline-flex min-h-11 items-center justify-center border border-foreground px-5 text-sm font-semibold transition hover:bg-foreground hover:text-background active:scale-[0.98]">
          {request.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="submit"
          autoFocus={request.kind === "confirm"}
          className={`inline-flex min-h-11 items-center justify-center border px-5 text-sm font-semibold transition active:scale-[0.98] ${danger ? "border-accent-600 bg-accent-600 text-on-accent hover:border-accent-700 hover:bg-accent-700" : "border-foreground bg-foreground text-background hover:border-accent-600 hover:bg-accent-600 hover:text-on-accent"}`}
        >
          {request.confirmLabel ?? "OK"}
        </button>
      </div>
    </form>
  );
}
