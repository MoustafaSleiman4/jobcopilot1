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

        {/* Al Faisaliah Tower — tapered obelisk + a clearly separated ball + spire mast */}
        <g>
          <polygon points="110,260 118,160 128,100 152,100 162,160 170,260" />
          <circle cx="140" cy="76" r="20" />
          <rect x="137.5" y="12" width="5" height="44" />
        </g>

        {/* Kingdom Centre / Al Mamlakah Tower — "bottle-opener" silhouette:
            solid base, two legs, a smooth rounded arch opening, connecting
            lintel on top */}
        <path
          fillRule="evenodd"
          d="M300,260 L300,90 Q300,68 325,68 L385,68 Q410,68 410,90 L410,260 Z
             M334,260 L334,145 Q334,86 355,86 Q376,86 376,145 L376,260 Z"
        />

        {/* Burj Khalifa — tiered, tapering central spire, the tallest element */}
        <path d="M540,260 L540,168 L560,168 L560,120 L578,120 L578,78 L596,78 L596,50 L600,50 L604,8 L608,50 L612,50 L612,78 L630,78 L630,120 L648,120 L648,168 L668,168 L668,260 Z" />

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
