/**
 * A soft desert-dune-style wave divider, used between sections to give the
 * landing page a Gulf-inspired backdrop without relying on photos/licensed
 * imagery. Pure inline SVG so it's self-contained and themeable via
 * currentColor / the two fill classes passed in.
 */
export default function DuneDivider({
  className = "",
  backFill = "text-gold-100",
  frontFill = "text-surface",
}: {
  className?: string;
  backFill?: string;
  frontFill?: string;
}) {
  return (
    <div className={`pointer-events-none relative h-16 w-full overflow-hidden sm:h-24 ${className}`}>
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path
          d="M0,80 C240,20 360,110 600,60 C840,10 960,90 1200,50 C1320,30 1380,45 1440,60 L1440,120 L0,120 Z"
          className={backFill}
          fill="currentColor"
          opacity={0.5}
        />
        <path
          d="M0,100 C220,50 420,100 640,80 C900,55 1020,100 1260,75 C1340,66 1400,72 1440,80 L1440,120 L0,120 Z"
          className={frontFill}
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
