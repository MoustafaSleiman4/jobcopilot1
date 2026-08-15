// Small shared avatar circle (photo or initials fallback) with an optional
// online-status dot overlay. Factored out because the online dot needs to
// look byte-for-byte identical everywhere it appears (PersonCard, the
// messages conversation list, the messages thread header) — centralizing it
// here means that stays true automatically instead of three call sites
// hand-rolling the same `absolute -end-0.5 -bottom-0.5 ...` span and
// drifting over time.
const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

const DOT_SIZE_CLASSES = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
} as const;

export type AvatarSize = keyof typeof SIZE_CLASSES;

export default function Avatar({
  avatarUrl,
  name,
  size = "md",
  isOnline,
  className = "",
}: {
  avatarUrl: string | null | undefined;
  name: string;
  size?: AvatarSize;
  isOnline?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex flex-none ${className}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className={`${SIZE_CLASSES[size]} rounded-full object-cover`} />
      ) : (
        <span
          className={`flex ${SIZE_CLASSES[size]} items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700`}
        >
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      {isOnline && (
        <span
          aria-hidden="true"
          className={`absolute -end-0.5 -bottom-0.5 ${DOT_SIZE_CLASSES[size]} rounded-full border-2 border-surface bg-emerald-500`}
        />
      )}
    </span>
  );
}
