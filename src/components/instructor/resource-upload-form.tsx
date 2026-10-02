"use client";

import { type ChangeEvent, useId, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { registerResource, requestResourceUpload } from "@/features/instructor/resource-actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function ResourceUploadForm() {
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputId = useId();

  async function upload(file: File) {
    setErrorMsg(null);
    setUploading(true);
    try {
      const ticket = await requestResourceUpload({ name: file.name, size: file.size, type: file.type });
      if (!ticket.ok) {
        setErrorMsg(ticket.error);
        return;
      }
      const { error } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type,
      });
      if (error) {
        setErrorMsg("The upload failed. Please try again.");
        return;
      }
      const result = await registerResource({ path: ticket.path, name: file.name, size: file.size, type: file.type });
      if (!result.ok) setErrorMsg(result.error);
    } catch {
      setErrorMsg("The upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(file);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        Upload a resource
      </label>
      <input id={inputId} type="file" onChange={onPick} disabled={uploading} className="hidden" />
      <Button type="button" size="sm" disabled={uploading} onClick={() => document.getElementById(inputId)?.click()}>
        {uploading ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
        )}
        Upload resource
      </Button>
      {errorMsg && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
