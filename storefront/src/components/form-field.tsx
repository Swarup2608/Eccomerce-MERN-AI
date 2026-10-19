"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  hint?: string;
}

export function FormField({ label, name, hint, ...input }: FormFieldProps) {
  return (
    <label className="field">
      <span className="text-[13px] font-medium">{label}</span>
      <input name={name} className="input" {...input} />
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </label>
  );
}

const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

// Mirrors the API's password rule: 8+ characters with upper and lower case, a number and a special character.
function strength(value: string): number {
  if (value.length < 8) return 0;
  return 1 + Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) + Number(/\d/.test(value)) + Number(/[^A-Za-z0-9]/.test(value));
}

// Password input with a Show/Hide toggle and, optionally, the design's four-bar strength meter.
export function PasswordField({ label, name, hint, meter = false, ...input }: FormFieldProps & { meter?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const score = strength(value);
  return (
    <div className="field">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className="input pr-16"
          {...input}
          onChange={(event) => {
            setValue(event.target.value);
            input.onChange?.(event);
          }}
        />
        <button type="button" onClick={() => setVisible(!visible)} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-xs text-accent-700">
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {meter ? (
        <div className="mt-2 flex items-center gap-1.5" aria-live="polite">
          {[1, 2, 3, 4].map((bar) => (
            <span key={bar} className={`h-[3px] flex-1 transition-colors duration-300 ${value && score >= bar ? (score >= 3 ? "bg-foreground" : "bg-accent") : "bg-divider"}`} />
          ))}
          <span className="min-w-[76px] text-right text-xs text-foreground/60">{value ? STRENGTH[score] : ""}</span>
        </div>
      ) : null}
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-accent pl-2.5 text-[13px] text-accent-700">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button type="submit" disabled={pending} className="btn btn-primary min-h-12 justify-between text-[15px]">
      <span>{pending ? "Please wait..." : children}</span>
      <span aria-hidden>→</span>
    </button>
  );
}
