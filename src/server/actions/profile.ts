"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { saveAvatar, updateProfile } from "@/lib/profiles";
import { firstIssue, profileSchema } from "@/lib/validation";

export type ProfileFormState = { error: string | null; success: string | null };

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    username: formData.get("username") ?? "",
    displayName: formData.get("displayName") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), success: null };

  const result = await updateProfile({
    userId: user.id,
    username: parsed.data.username,
    displayName: parsed.data.displayName,
  });

  if (!result.ok) return { error: result.error, success: null };

  revalidatePath("/app");
  revalidatePath("/app/profile");
  revalidatePath("/app/send");
  revalidatePath("/app/activity");
  revalidatePath("/admin");

  return { error: null, success: "Profile saved." };
}

export type AvatarState = { error: string | null; success: string | null };

/**
 * Stores a new profile picture. The browser downscales the image first, and the
 * server independently re-validates type and size before writing bytes.
 */
export async function uploadAvatarAction(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const user = await requireUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload.", success: null };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await saveAvatar({ userId: user.id, bytes, mimeType: file.type });
  if (!result.ok) return { error: result.error, success: null };

  revalidatePath("/app");
  revalidatePath("/app/profile");
  revalidatePath("/app/activity");
  revalidatePath("/admin");

  return { error: null, success: "Profile picture updated." };
}
