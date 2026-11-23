"use client";
import React from 'react';

import { Camera, Check, CircleAlert, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/fairmoney/avatar";
import { Magnetic } from "@/components/fairmoney/magnetic";
import { updateProfileAction, uploadAvatarAction } from "@/lib/actions/profile";

/**
 * Downscales in the browser and returns a compact data URL. The picture is
 * stored on the profile row in Supabase, so keeping it small matters: 512px
 * JPEG is a few tens of kilobytes instead of a multi-megabyte upload.
 */
async function downscaleImage(file: File, maxEdge = 512): Promise<{ dataUrl: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), mimeType: "image/jpeg" };
  } catch {
    // Fall back to the original file when the browser cannot decode it here.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read that file"));
      reader.readAsDataURL(file);
    });
    return { dataUrl, mimeType: file.type || "image/jpeg" };
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
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreparing(true);
    setAvatarError(null);

    try {
      const prepared = await downscaleImage(file);
      setPreview(prepared.dataUrl);
      const result = await uploadAvatarAction(prepared);

      if (result.error) {
        setAvatarError(result.error);
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.success);
      }
    } catch {
      setAvatarError("That image could not be read.");
      toast.error("That image could not be read.");
    } finally {
      setPreparing(false);
      // Clear first so choosing the same file twice fires again.
      event.target.value = "";
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setProfilePending(true);
    setProfileError(null);
    setProfileSuccess(null);

    const result = await updateProfileAction({
      username: String(data.get("username") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
    });

    setProfilePending(false);

    if (result.error) {
      setProfileError(result.error);
      toast.error(result.error);
      return;
    }

    setProfileSuccess(result.success);
    if (result.success) toast.success(result.success);
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
              // Instant local preview while the picture is being saved.
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
            {preparing ? (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            ) : null}
          </span>

          <div className="min-w-[180px] flex-1">
            <input
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
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              JPG, PNG, WEBP or GIF · resized to 512px and kept in this browser.
            </p>
          </div>
        </div>

        {avatarError ? (
          <p className="fm-notice mt-5 border border-destructive/25 bg-destructive/8 text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {avatarError}
          </p>
        ) : null}
      </section>

      <section className="fm-card px-6 py-6">
        <h2 className="font-display text-[16px] font-semibold text-foreground">Profile details</h2>

        <form onSubmit={saveProfile} className="mt-6 space-y-6">
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

          {profileError ? (
            <p className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {profileError}
            </p>
          ) : null}

          {profileSuccess ? (
            <p className="fm-notice border border-emerald-600/25 bg-emerald-50 text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              {profileSuccess}
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
