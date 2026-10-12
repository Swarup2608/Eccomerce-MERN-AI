import type { RequestHandler } from "express";

// The API defaults to `no-store` (see security.ts). Public catalog reads carry no personal data, so browsers and CDNs
// may keep them briefly; `Vary: Cookie` keeps a shared cache from mixing them with signed-in responses.
export function publicCache(maxAgeSec: number): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 5}`);
    res.vary("Cookie");
    next();
  };
}
