"use client";
import React from 'react';

import { Camera, Check, CircleAlert, Loader2, Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/fairmoney/avatar";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { updateProfileAction, uploadAvatarAction } from "@/server/actions/profile";

const AVATAR_INITIAL = { error: null, success: null };
const PROFILE_INITIAL = { error: null, success: null };

/** Client-side downscale keeps uploads small; the server re-validates anyway. */
async function downscaleImage(file: File, maxEdge = 512): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ProfileForm({
  username,
  displayName,
  avatarHue,
  avatarUpdatedAt,
}: {
  username: string;
  displayName: string;
  avatarHue: number;
  avatarUpdatedAt: Date | string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [avatarState, avatarAction, avatarPending] = useActionState(
    uploadAvatarAction,
    AVATAR_INITIAL,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfileAction,
    PROFILE_INITIAL,
  );

  useEffect(() => {
    if (avatarState.error) toast.error(avatarState.error);
    if (avatarState.success) {
      toast.success(avatarState.success);
      setPreview(null);
    }
  }, [avatarState]);

  useEffect(() => {
    if (profileState.error) toast.error(profileState.error);
    if (profileState.success) toast.success(profileState.success);
  }, [profileState]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreparing(true);
    const prepared = await downscaleImage(file);
    setPreview(URL.createObjectURL(prepared));

    // Hand the prepared file to the form's real input, then submit it.
    const transfer = new DataTransfer();
    transfer.items.add(prepared);
    if (inputRef.current) inputRef.current.files = transfer.files;
    formRef.current?.requestSubmit();
    setPreparing(false);
  }

  return (
    <div className="space-y-8">
      <section className="fm-card px-6 py-6">
        <h2 className="font-display text-[16px] font-semibold text-foreground">Profile picture</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Shown next to your handle on transfers, activity and across the app.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <span className="relative shrink-0">
            {preview ? (
              // Instant local preview while the upload is in flight.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-1 ring-black/5"
              />
            ) : (
              <Avatar
                displayName={displayName}
                hue={avatarHue}
                username={username}
                avatarUpdatedAt={avatarUpdatedAt}
                size="xl"
                className="h-24 w-24 text-xl"
              />
            )}
            {avatarPending || preparing ? (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            ) : null}
          </span>

          <div className="min-w-[180px] flex-1">
            <form ref={formRef} action={avatarAction}>
              <input
                ref={inputRef}
                type="file"
                name="avatar"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFile}
                className="hidden"
                id="avatar-file"
              />
              <label htmlFor="avatar-file" className="fm-btn fm-btn-ghost cursor-pointer">
                <Camera className="h-4 w-4" />
                {avatarUpdatedAt ? "Change photo" : "Upload photo"}
              </label>
              <button type="submit" disabled={avatarPending} className="hidden">
                Save photo
              </button>
            </form>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              JPG, PNG, WEBP or GIF · resized to 512px before upload.
            </p>
          </div>
        </div>

        {avatarState.error ? (
          <p className="fm-notice mt-5 border border-destructive/25 bg-destructive/8 text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {avatarState.error}
          </p>
        ) : null}
      </section>

      <section className="fm-card px-6 py-6">
        <h2 className="font-display text-[16px] font-semibold text-foreground">Profile details</h2>

        <form action={profileAction} className="mt-6 space-y-6">
          <div>
            <label htmlFor="username" className="fm-label block">
              Username
            </label>
            <div className="mt-3.5 flex items-center gap-2 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-white">
              <span className="font-display text-[17px] font-semibold text-muted-foreground">@</span>
              <input
                id="username"
                name="username"
                defaultValue={username}
                required
                autoCapitalize="none"
                spellCheck={false}
                className="fm-numeric min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none"
              />
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              3–20 letters, numbers or underscores. Handles stay unique across INSTANT PAYMENT, and
              any transfers you already received keep their history.
            </p>
          </div>

          <div>
            <label htmlFor="displayName" className="fm-label block">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={displayName}
              required
              className="fm-field mt-3.5"
            />
          </div>

          {profileState.error ? (
            <p className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {profileState.error}
            </p>
          ) : null}

          {profileState.success ? (
            <p className="fm-notice border border-emerald-600/25 bg-emerald-50 text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              {profileState.success}
            </p>
          ) : null}

          <Magnetic className="w-full" strength={0.14}>
            <button type="submit" disabled={profilePending} className="fm-btn fm-btn-primary w-full">
              {profilePending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Save profile changes
                </>
              )}
            </button>
          </Magnetic>
        </form>
      </section>
    </div>
  );
}
