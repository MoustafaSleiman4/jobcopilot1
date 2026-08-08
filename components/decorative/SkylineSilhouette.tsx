/**
 * A skyline silhouette used behind the hero and CTA sections, built to
 * clearly read as four specific, recognizable landmarks (left to right):
 *  - Al Faisaliah Tower (Riyadh) — tapered obelisk with its signature
 *    gold sphere near the top
 *  - Kingdom Centre / Al Mamlakah Tower (Riyadh) — the "bottle-opener"
 *    silhouette: a solid tapered slab from the ground up through about
 *    two-thirds of its height, flaring into two shoulders near the top
 *    that curve back in to nearly meet, leaving a lens-shaped keyhole
 *    opening capped by a short lintel — not a full-height arch/gateway
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

        {/* Al Faisaliah Tower (Riyadh) — redrawn against real reference
            photos (user-supplied) after the previous pass still read as
            too generic/unclear. The real building is unmistakable for
            three features together, so all three are drawn explicitly
            rather than left as a plain triangular fill: (1) a ribbed,
            banded glass facade running the height of the tapering body,
            (2) a large gold sphere sitting snugly ON the tower's tip
            (not floating above it on a gap), braced by short diagonal
            struts exactly as the real cross-bracing under the ball, and
            (3) a long needle spire continuing above the sphere, capped
            by a small finial. */}
        <g>
          {/* tapering body */}
          <path d="M117,260 L131,100 L149,100 L163,260 Z" />
          {/* horizontal facade ribs — thinner/fainter than the main
              outline so they read as glazing bands, not extra outline */}
          <g strokeWidth={1.1} strokeOpacity={0.4}>
            <line x1="129.7" y1="115" x2="150.3" y2="115" />
            <line x1="127.9" y1="135" x2="152.1" y2="135" />
            <line x1="126.2" y1="155" x2="153.8" y2="155" />
            <line x1="124.4" y1="175" x2="155.6" y2="175" />
            <line x1="122.7" y1="195" x2="157.3" y2="195" />
            <line x1="120.9" y1="215" x2="159.1" y2="215" />
            <line x1="119.2" y1="235" x2="160.8" y2="235" />
            <line x1="117.4" y1="255" x2="162.6" y2="255" />
          </g>
          {/* faint center fold line, hinting at the building's triangular
              (three-sided) plan without needing a full 3D render */}
          <line x1="140" y1="100" x2="140" y2="259" strokeWidth={1.1} strokeOpacity={0.35} />
          {/* diagonal braces connecting the tower's tip to the sphere,
              matching the real building's visible cross-bracing */}
          <line x1="131" y1="101" x2="126" y2="86" strokeWidth={1.6} />
          <line x1="149" y1="101" x2="154" y2="86" strokeWidth={1.6} />
          {/* the signature gold sphere, sitting on the tip */}
          <circle cx="140" cy="80" r="19" />
          {/* needle spire rising above the sphere, capped with a small finial */}
          <rect x="138.3" y="14" width="3.4" height="47" />
          <circle cx="140" cy="12" r="2.6" />
        </g>

        {/* Kingdom Centre / Al Mamlakah Tower — redrawn against a real
            reference photo after the previous version read as a plain
            rounded gateway/arch (a hole running the full height, down to
            the ground on both sides) rather than the actual building. The
            real tower is a single solid slab from the ground up through
            about two-thirds of its height — the "keyhole" opening only
            appears in the upper third, where the body flares outward into
            two shoulders, curves back inward, and nearly meets at the top,
            leaving a lens-shaped negative space with a short flat lintel
            closing it at the very top. Drawn as one solid outline (the
            tapered, flared body) with a second, smaller lens-shaped path
            cut out of just the upper portion via evenodd — not two full-
            height legs. */}
        <path
          fillRule="evenodd"
          d="M305,260 L305,80 Q305,62 322,58 L398,58 Q415,62 415,80 L415,260 Z
             M360,148 Q332,135 325,95 Q330,68 355,64 L365,64 Q390,68 395,95 Q388,135 360,148 Z"
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
