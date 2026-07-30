/**
 * An ambient Gulf/Levant skyline silhouette used as a low-opacity background
 * behind the hero and CTA sections. These are original, simplified vector
 * silhouettes inspired by well-known building outlines (in the style of
 * generic "city skyline" clip art), not traced from photographs or
 * architectural drawings:
 *  - a tiered, tapering central tower evoking Burj Khalifa (Dubai)
 *  - a tapered obelisk with a sphere evoking Al Faisaliah Tower (Riyadh)
 *  - a low rooftop-terrace building evoking Beirut Digital District, which
 *    (unlike the two towers above) is a low-rise district rather than a
 *    single iconic tower, so it's represented that way
 * plus generic towers/minarets/a crescent moon to round out the skyline.
 */
export default function SkylineSilhouette({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        {/* crescent moon */}
        <path d="M1060 36a24 24 0 1 0 6 47 29 29 0 1 1-6-47z" />

        {/* far-left low towers */}
        <rect x="20" y="155" width="26" height="65" />
        <rect x="55" y="135" width="20" height="85" />
        <rect x="90" y="165" width="30" height="55" />

        {/* minaret */}
        <rect x="150" y="95" width="9" height="125" />
        <polygon points="145.5,95 154.5,68 163.5,95" />
        <rect x="142" y="91" width="25" height="7" />

        {/* Al Faisaliah Tower — tapered obelisk + sphere + mast */}
        <polygon points="330,220 350,58 368,58 388,220" />
        <circle cx="359" cy="46" r="11" />
        <rect x="357" y="10" width="4" height="30" />

        {/* low mid towers */}
        <rect x="420" y="150" width="24" height="70" />
        <rect x="452" y="130" width="18" height="90" />

        {/* Burj Khalifa — tiered, tapering central spire (the tallest element) */}
        <path d="M540,220 L540,130 L556,130 L556,86 L570,86 L570,48 L584,48 L590,10 L596,48 L610,48 L610,86 L624,86 L624,130 L640,130 L640,220 Z" />

        {/* mid towers right of the spire */}
        <rect x="670" y="140" width="22" height="80" />
        <rect x="700" y="160" width="30" height="60" />
        <polygon points="750,220 768,95 786,220" />

        {/* second minaret */}
        <rect x="840" y="100" width="9" height="120" />
        <polygon points="835.5,100 844.5,74 853.5,100" />
        <rect x="832" y="96" width="25" height="7" />

        {/* generic towers */}
        <rect x="900" y="145" width="26" height="75" />
        <rect x="940" y="120" width="20" height="100" />

        {/* Beirut Digital District — low rooftop-terrace building rather
            than a tall tower, since BDD is a district, not a single icon */}
        <rect x="990" y="165" width="90" height="55" />
        <rect x="1000" y="150" width="70" height="15" />
        {/* rooftop pergola/trellis, common on BDD's converted rooftops */}
        <rect x="1010" y="136" width="3" height="14" />
        <rect x="1026" y="136" width="3" height="14" />
        <rect x="1042" y="136" width="3" height="14" />
        <rect x="1058" y="136" width="3" height="14" />
        <rect x="1008" y="134" width="56" height="3" />

        {/* right-edge towers */}
        <rect x="1100" y="155" width="24" height="65" />
        <rect x="1135" y="135" width="18" height="85" />
        <rect x="1165" y="170" width="26" height="50" />
      </g>
    </svg>
  );
}
