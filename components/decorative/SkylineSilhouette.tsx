/**
 * A skyline silhouette used behind the hero and CTA sections, built to
 * clearly read as four specific, recognizable landmarks (left to right):
 *  - Al Faisaliah Tower (Riyadh) — tapered obelisk with its signature
 *    gold sphere near the top
 *  - Kingdom Centre / Al Mamlakah Tower (Riyadh) — the "bottle-opener"
 *    silhouette: twin legs rising from a shared base, joined by an arch
 *    opening, capped by a connecting lintel at the top
 *  - Burj Khalifa (Dubai) — the tallest element, a tiered, stepped tower
 *    tapering to a needle spire
 *  - Beirut Digital District — represented as a cluster of low/mid-rise
 *    buildings with a rooftop pergola, since BDD is a district rather
 *    than a single tower
 * These are original, simplified vector silhouettes drawn in the style of
 * "city skyline" illustration/clip art (not traced from photos or
 * architectural drawings), sized and spaced so each one is unambiguous
 * rather than blending into generic filler buildings.
 */
export default function SkylineSilhouette({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 260"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden="true"
    >
      <g
        fill="currentColor"
        fillOpacity={0.55}
        stroke="currentColor"
        strokeOpacity={0.9}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* far-left low filler buildings */}
        <rect x="10" y="200" width="28" height="60" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x="46" y="180" width="20" height="80" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />

        {/* Al Faisaliah Tower (Riyadh) — a slender, STRAIGHT-sided obelisk
            (an earlier version used a curved Q-bezier taper that bowed
            outward into a "bell"/parachute silhouette at real render size —
            caught only by actually screenshotting it, not from reading the
            coordinates — a straight linear taper reads far more crisply as
            a needle-like tower), closing to a point capped by its
            signature gold sphere, with the thin spire mast rising above
            the sphere exactly as on the real building. */}
        <g>
          <path d="M117,260 L131,100 L149,100 L163,260 Z" />
          <circle cx="140" cy="79" r="17" />
          <rect x="138" y="18" width="4" height="42" />
        </g>

        {/* Kingdom Centre / Al Mamlakah Tower — "bottle-opener" silhouette,
            narrowed and slimmed (legs and overall width both reduced) from
            an earlier version that read as a fat rainbow/gateway arch
            rather than a slender skyscraper — two legs rising and leaning
            inward, meeting a pointed (parabolic, not semicircular) arch
            opening near the top, capped by a flat crown lintel that sits
            slightly proud of the legs on either side. */}
        <path
          fillRule="evenodd"
          d="M300,260 L306,145 Q310,95 322,76 Q333,62 350,60 L370,60 Q387,62 398,76 Q410,95 414,145 L420,260 Z
             M333,260 L337,165 Q339,115 346,100 Q351,92 360,92 Q369,92 374,100 Q381,115 383,165 L387,260 Z"
        />

        {/* Burj Khalifa — the tallest element by a clear margin, and drawn
            slender rather than blocky: a narrower base than an earlier
            version, five graduated setback steps (rather than three coarse
            ones) narrowing it step by step, finished with a long,
            needle-thin spire making up roughly a third of the total height
            — echoing the real tower's Y-shaped, spiraling setbacks without
            the silhouette reading as a generic stepped high-rise. */}
        <path
          d="M572,260 L572,190 L576,190 L576,140 L580,140 L580,105 L584,105 L584,78
             L588,78 L588,58 L592,58 L600,5 L608,58 L612,58 L612,78 L616,78 L616,105
             L620,105 L620,140 L624,140 L624,190 L628,190 L628,260 Z"
        />

        {/* low filler buildings between landmarks */}
        <rect x="440" y="205" width="26" height="55" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x="700" y="195" width="24" height="65" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x="734" y="215" width="30" height="45" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />

        {/* Beirut Digital District — cluster of low/mid-rise buildings with
            a rooftop pergola/trellis, since BDD is a district, not one tower */}
        <g fillOpacity={0.5} strokeOpacity={0.85}>
          <rect x="860" y="150" width="50" height="110" />
          <rect x="918" y="185" width="115" height="75" />
          <rect x="928" y="165" width="90" height="22" />
          {/* rooftop pergola/trellis slats */}
          <rect x="940" y="148" width="4" height="18" />
          <rect x="960" y="148" width="4" height="18" />
          <rect x="980" y="148" width="4" height="18" />
          <rect x="1000" y="148" width="4" height="18" />
          <rect x="936" y="145" width="68" height="4" />
        </g>

        {/* far-right low filler buildings */}
        <rect x="1080" y="195" width="26" height="65" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x="1116" y="175" width="20" height="85" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x="1150" y="210" width="30" height="50" fillOpacity={0.28} strokeOpacity={0.5} strokeWidth={1.5} />
      </g>
    </svg>
  );
}
