import "server-only";

import DOMPurify from "isomorphic-dompurify";

/**
 * Turns provider HTML into something safe to put in the page.
 *
 * This replaces an earlier `<iframe sandbox="">` approach. The iframe contained
 * scripts correctly, but a fully sandboxed iframe cannot run the script that
 * would report its own height — so the body had to be given a hard-coded height,
 * which left a large dead area under every short message. Sanitising instead
 * means the markup is safe *as content*, so it can live in the page and size
 * itself naturally.
 *
 * Three defences, all needed:
 *  1. DOMPurify removes scripts, event handlers and `javascript:` URLs.
 *  2. Remote image sources are parked in `data-src` so tracking pixels do not
 *     fire on open — the reader restores them on request, as Gmail does.
 *  3. The caller renders the result inside a SHADOW ROOT, so any `<style>` the
 *     sender included cannot repaint the app around it.
 */

/**
 * Hooks live on the DOMPurify SINGLETON, not on this module.
 *
 * That matters in dev: a hot reload re-runs this module but keeps the same
 * DOMPurify instance, so `addHook` alone accumulates every previous version of
 * the hook — including ones from code that no longer exists. Clearing first makes
 * registration idempotent no matter how often the module is re-evaluated.
 */
let hooksReady = false;

function registerHooks() {
  if (hooksReady) return;
  hooksReady = true;

  DOMPurify.removeAllHooks();

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // NOT `node instanceof Element`: on the server this runs against jsdom, whose
    // nodes are not instances of any global `Element` — that check throws
    // ReferenceError in Node. nodeType 1 is an element in every DOM.
    if (node.nodeType !== 1) return;

    const element = node as unknown as {
      tagName: string;
      getAttribute(name: string): string | null;
      setAttribute(name: string, value: string): void;
      removeAttribute(name: string): void;
      hasAttribute(name: string): boolean;
    };

    // Park remote images. `cid:` refers to an inline part we do not store, and
    // `data:` is already inert, so neither needs deferring.
    if (element.tagName === "IMG") {
      const src = element.getAttribute("src");
      if (src && /^https?:/i.test(src)) {
        element.setAttribute("data-src", src);
        element.removeAttribute("src");
      }
    }

    // Any link that survives sanitisation opens away from the app, and must not
    // leak where it was opened from.
    if (element.tagName === "A" && element.hasAttribute("href")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    }
  });
}

export type SanitizedBody = {
  html: string;
  /** True when at least one remote image was parked. Drives "Display images". */
  hasBlockedImages: boolean;
};

export function sanitizeEmailHtml(raw: string | null): SanitizedBody | null {
  if (!raw) return null;

  registerHooks();

  const html = DOMPurify.sanitize(raw, {
    // `style` is kept: without it, HTML mail loses all of its formatting. It is
    // safe here only because the shadow root stops it affecting the app.
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "base", "meta"],
    FORBID_ATTR: ["srcset", "ping", "formaction"],
    ALLOW_DATA_ATTR: true,
    // Blocks javascript:, vbscript: and friends while keeping mail's real needs.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|cid|data):/i,
  });

  return { html, hasBlockedImages: html.includes("data-src=") };
}
