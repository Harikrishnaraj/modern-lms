"use client";

import { useEffect, useRef, useState } from "react";
import { HOST_FRAME_PATH } from "@/services/scorm/host-frame";

interface ScormMessage {
  source: "modern-lms-scorm";
  status: "commit" | "finish";
  cmi: Record<string, string>;
}

function isScormMessage(data: unknown): data is ScormMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === "modern-lms-scorm" &&
    typeof (data as { cmi?: unknown }).cmi === "object"
  );
}

/**
 * Where the package runs. With a dedicated content origin (NEXT_PUBLIC_SCORM_CONTENT_ORIGIN, a
 * different host than the app), the frame gets allow-same-origin: the package's own nested frames
 * then share that origin (authoring-tool drivers such as Storyline's need this), while it stays
 * cross-origin to the app and cannot read its cookies or DOM. Without one — or if it is
 * misconfigured to the app's own origin, where allow-scripts + allow-same-origin would let the
 * frame escape its sandbox — every document gets a unique opaque origin instead (single-frame
 * packages only).
 */
export function frameConfig(contentOrigin: string | undefined, appOrigin: string): { origin: string; sandbox: string } {
  let origin = "";
  try {
    origin = contentOrigin ? new URL(contentOrigin).origin : "";
  } catch {
    origin = "";
  }
  if (!origin || origin === appOrigin) return { origin: "", sandbox: "allow-scripts allow-modals" };
  return { origin, sandbox: "allow-scripts allow-same-origin allow-modals" };
}

/**
 * Runs SCORM content in a sandboxed iframe (see frameConfig), so it cannot reach the real app's
 * window/cookies/storage. Every HTML file of the package has a same-document API shim injected
 * server-side (src/services/scorm/shim.ts); it can only reach this component via postMessage,
 * validated here by event.source rather than by origin. `onCommit` is omitted in instructor
 * preview/review, where there is no enrollment to save progress against.
 */
export function ScormPlayer({
  lessonId,
  token,
  launchPath,
  onCommit,
}: {
  lessonId: string;
  /** Signed asset token (see services/scorm/token.ts); every relative URL in the package inherits it. */
  token: string;
  launchPath: string;
  onCommit?: (cmi: Record<string, string>) => Promise<unknown>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"active" | "saving" | "saved" | "error">("active");
  const [frame, setFrame] = useState<{ origin: string; sandbox: string } | null>(null);

  // Decided after mount because it compares against this page's own origin, which only exists in
  // the browser -- SSR/hydration cannot compute this value, so it genuinely needs an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrame(frameConfig(process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN, window.location.origin));
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isScormMessage(event.data) || !onCommit) return;
      setStatus("saving");
      onCommit(event.data.cmi)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCommit]);

  return (
    <div className="space-y-2">
      {frame ? (
        <iframe
          ref={iframeRef}
          src={`${frame.origin}/api/scorm/${lessonId}/${token}/${
            // The host frame needs its child to share its origin, which only a content origin gives.
            frame.origin ? HOST_FRAME_PATH : launchPath.split("/").map(encodeURIComponent).join("/")
          }`}
          sandbox={frame.sandbox}
          title="SCORM content"
          className="h-[70vh] w-full rounded-card border border-border bg-white"
        />
      ) : (
        <div aria-hidden="true" className="h-[70vh] w-full rounded-card border border-border bg-white" />
      )}
      {status === "error" && <p role="alert" className="text-sm text-danger-text">We could not save your progress just now.</p>}
    </div>
  );
}
