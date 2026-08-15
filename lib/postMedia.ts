// Client-side pre-checks for post-media uploads (images/video for
// PostComposer). These are fast, friendly checks only — the `post-media`
// storage bucket's own file_size_limit/allowed_mime_types are the real
// enforcement, same division of responsibility as the resume-photos upload
// in app/[locale]/dashboard/resume/page.tsx.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGES_PER_POST = 6;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type);
}

export function isVideoFile(file: File): boolean {
  return VIDEO_MIME_TYPES.includes(file.type);
}

/** Public URL for a stored post-media object — the bucket is public-read,
 * same convention as `resume-photos`. */
export function postMediaPublicUrl(
  storage: { from: (bucket: string) => { getPublicUrl: (path: string) => { data: { publicUrl: string } } } },
  storagePath: string
): string {
  return storage.from("post-media").getPublicUrl(storagePath).data.publicUrl;
}
