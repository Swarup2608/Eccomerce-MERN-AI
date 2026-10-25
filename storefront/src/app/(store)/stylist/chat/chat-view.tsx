"use client";

import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-field";
import { ProductLink } from "@/components/stylist-bits";
import { Button, EmptyState, Notice } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatInr } from "@/lib/money";
import { GENDERS, stylistApi, type ChatResult, type ChatTurn, type Gender } from "@/lib/stylist";

// One exchange as shown on screen; only role and text go back to the service as history.
interface Entry extends ChatTurn { result?: ChatResult }

const STARTERS = ["Something breezy for a beach weekend under 3000", "What should I wear to a friend's sangeet?", "A smart outfit for a job interview"];

export function ChatView() {
  const [gender, setGender] = useState<Gender | "">("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [entries, busy, progress]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...entries, { role: "user" as const, content }];
    setEntries(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const result = await stylistApi.chatStream(next.map(({ role, content }) => ({ role, content })), gender || undefined, setProgress);
      setEntries([...next, { role: "assistant", content: result.reply, result }]);
    } catch (err) {
      setError(errorMessage(err));
      // Put the message back so it can be retried without retyping.
      setEntries(entries);
      setDraft(content);
    }
    setBusy(false);
    setProgress(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,260px)_1fr]">
      <aside className="flex flex-col gap-4 self-start">
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium">Styling for</legend>
          <div className="grid grid-cols-2 gap-3">
            {GENDERS.map((g) => (
              <label key={g.value} className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 text-sm ${gender === g.value ? "border-foreground" : "border-foreground/20"}`}>
                <input type="radio" name="chat-gender" checked={gender === g.value} onChange={() => setGender(g.value)} />
                <span className="font-semibold">{g.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {entries.length ? <Button variant="ghost" className="self-start px-0" onClick={() => { setEntries([]); setError(null); }} disabled={busy}>Start a new chat</Button> : null}
      </aside>

      <section className="flex min-w-0 flex-col gap-6" aria-label="Conversation">
        <div className="flex flex-col gap-6" aria-live="polite">
          {!entries.length ? (
            <EmptyState title="Ask the stylist anything" text="Describe the occasion, the place or a budget. The stylist only suggests real, in-stock products from the shop.">
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => <Button key={s} onClick={() => send(s)} disabled={busy}>{s}</Button>)}
              </div>
            </EmptyState>
          ) : null}
          {entries.map((e, n) =>
            e.role === "user" ? (
              <p key={n} className="m-0 max-w-[65ch] self-end border border-foreground/20 bg-surface px-4 py-3 text-sm">{e.content}</p>
            ) : (
              <div key={n} className="flex max-w-full flex-col gap-4">
                <p className="m-0 max-w-[65ch] whitespace-pre-line text-base">{e.content}</p>
                {e.result?.mode === "fallback" ? <Notice tone="amber">The AI stylist is busy, so these are rule-based matches.</Notice> : null}
                {e.result?.products.length ? (
                  <>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-4 gap-y-8">
                      {e.result.products.map((s) => <ProductLink key={s.id} s={s} feedback />)}
                    </div>
                    {e.result.products.length > 1 ? <p className="m-0 text-sm tabular-nums text-foreground/70">Together: {formatInr(e.result.total)}</p> : null}
                  </>
                ) : null}
              </div>
            ),
          )}
          {busy ? <p className="m-0 text-sm text-foreground/60">{progress ? `${progress}...` : "Reading your message..."}</p> : null}
          <div ref={endRef} />
        </div>

        <form
          className="flex flex-col gap-3 border-t border-divider pt-4"
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
          aria-label="Message the stylist"
        >
          <label htmlFor="chat-input" className="text-sm font-medium">Your message</label>
          <textarea
            id="chat-input"
            className="input min-h-20 py-2"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            placeholder="e.g. Linen shirts for a work trip to Chennai next week"
          />
          <FormError message={error} />
          <Button type="submit" variant="primary" className="self-start" disabled={busy || !draft.trim()}>{busy ? "Thinking..." : "Send"}</Button>
        </form>
      </section>
    </div>
  );
}
