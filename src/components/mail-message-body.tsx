"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Renders a sanitised email body inside a SHADOW ROOT.
 *
 * Two reasons for the shadow root, neither cosmetic:
 *  - HTML mail ships its own `<style>`, which would otherwise repaint the whole
 *    app. A shadow boundary contains it.
 *  - It lets the body size itself naturally. The previous implementation used a
 *    fully sandboxed iframe, which cannot run the script that reports its own
 *    height, so every message got a hard-coded 256px box with a large dead area
 *    under short messages.
 *
 * `innerHTML` here is safe *because* the string was sanitised server-side by
 * `sanitizeEmailHtml()` — scripts, event handlers and `javascript:` URLs are
 * already gone. Do not point this at unsanitised provider HTML.
 */
function ShadowHtml({
  html,
  showImages,
  className,
}: {
  html: string;
  showImages: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // attachShadow throws if called twice on the same element.
    if (!rootRef.current) {
      rootRef.current = host.attachShadow({ mode: "open" });
    }
    const root = rootRef.current;

    root.innerHTML = `<style>
      :host{display:block}
      *{max-width:100%}
      div,p,td,span,li{overflow-wrap:anywhere}
      body,html{margin:0}
      img{height:auto}
      a{color:#2563eb}
      pre{white-space:pre-wrap}
      blockquote{border-left:2px solid currentColor;opacity:.7;margin:8px 0;padding-left:12px}
      table{border-collapse:collapse}
      /* Tables are the one thing that legitimately exceeds the panel. */
      .px-scroll{overflow-x:auto}
    </style><div class="px-scroll">${html}</div>`;

    // Tracking pixels were parked in data-src at sanitise time. Restoring them is
    // an explicit user action, exactly as in Gmail.
    if (showImages) {
      root.querySelectorAll("img[data-src]").forEach((img) => {
        const src = img.getAttribute("data-src");
        if (src) img.setAttribute("src", src);
      });
    }
  }, [html, showImages]);

  return <div ref={hostRef} className={className} />;
}

export function MailMessageBody({
  html,
  quotedHtml,
  hasBlockedImages,
}: {
  html: string | null;
  quotedHtml: string | null;
  hasBlockedImages: boolean;
}) {
  const [showImages, setShowImages] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);

  if (!html && !quotedHtml) {
    return (
      <p className="text-muted-foreground px-4 py-3 text-xs">(no message body)</p>
    );
  }

  return (
    <div className="space-y-2 px-4 py-3">
      {hasBlockedImages && !showImages && (
        <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs">
          <ImageOff className="text-muted-foreground size-3.5 shrink-0" />
          <span className="text-muted-foreground">
            Images blocked to stop senders tracking when you open this.
          </span>
          <Button size="xs" variant="outline" onClick={() => setShowImages(true)}>
            Display images
          </Button>
        </div>
      )}

      {html && (
        <ShadowHtml html={html} showImages={showImages} className="text-sm" />
      )}

      {quotedHtml && (
        <div>
          {/* Gmail's "···" — without it, every reply repeats the whole thread. */}
          <Button
            size="xs"
            variant="secondary"
            aria-expanded={showQuoted}
            aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
            onClick={() => setShowQuoted((v) => !v)}
            className="px-1.5"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>

          {showQuoted && (
            <ShadowHtml
              html={quotedHtml}
              showImages={showImages}
              className="text-muted-foreground mt-2 border-l-2 pl-3 text-sm"
            />
          )}
        </div>
      )}
    </div>
  );
}
