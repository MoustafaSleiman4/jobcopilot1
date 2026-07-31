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

        {/* Al Faisaliah Tower (Riyadh) — a slender obelisk with a gently
            curved (not straight-edged) taper, the way the real tower's
            profile eases inward rather than forming hard angles, closing
            to a point that's capped by its signature gold sphere, with the
            thin spire mast rising above the sphere exactly as on the real
            building. */}
        <g>
          <path d="M104,260 L110,182 Q114,138 122,112 Q130,88 140,88 Q150,88 158,112 Q166,138 170,182 L176,260 Z" />
          <circle cx="140" cy="80" r="21" />
          <rect x="137.5" y="18" width="5" height="40" />
        </g>

        {/* Kingdom Centre / Al Mamlakah Tower — "bottle-opener" silhouette:
            a wide, gently tapering base rising into two legs that lean
            inward, meeting a pointed (not semicircular) arch opening near
            the top — the real building's arch is closer to a parabolic
            point than a round curve — capped by a flat crown lintel that
            sits slightly proud of the legs on either side. */}
        <path
          fillRule="evenodd"
          d="M296,260 L302,150 Q306,100 320,80 Q330,68 345,66 L365,66 Q380,68 390,80 Q404,100 408,150 L414,260 Z
             M330,260 L334,168 Q336,120 344,104 Q349,94 355,94 Q361,94 366,104 Q374,120 376,168 L380,260 Z"
        />

        {/* Burj Khalifa — the tallest element by a clear margin, and drawn
            slender rather than pyramidal: a modest-width base that stays
            near-parallel for its lower half (like a real skyscraper, not a
            ziggurat), then a handful of setbacks narrowing it step by step,
            finished with a long, needle-thin spire making up roughly a
            quarter of the total height — echoing the real tower's Y-shaped,
            spiraling setbacks without the silhouette reading as a pyramid. */}
        <path
          d="M572,260 L572,165 L580,165 L580,130 L588,130 L588,100 L594,100 L594,75
             L600,75 L604,8 L608,75 L614,75 L614,100 L620,100 L620,130 L628,130 L628,165
             L636,165 L636,260 Z"
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
