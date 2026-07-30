/**
 * An abstract, generic Gulf-city skyline silhouette (modern towers + a
 * minaret + a crescent moon) used as a low-opacity ambient background
 * behind the hero. Deliberately generic/abstract rather than depicting any
 * specific real building, so it reads as "Gulf" without copying a landmark.
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
        <path d="M1040 40a26 26 0 1 0 6 51 32 32 0 1 1-6-51z" />

        {/* low background towers */}
        <rect x="40" y="140" width="26" height="80" />
        <rect x="80" y="120" width="20" height="100" />
        <rect x="120" y="150" width="30" height="70" />
        <polygon points="150,150 165,150 165,220 150,220" />

        {/* minaret */}
        <rect x="230" y="90" width="10" height="130" />
        <polygon points="225,90 235,60 245,90" />
        <rect x="221" y="86" width="28" height="8" />

        {/* central tapered tower (generic, not a specific landmark) */}
        <polygon points="360,220 380,40 400,20 420,40 440,220" />
        <rect x="392" y="8" width="16" height="18" />

        {/* mid towers */}
        <rect x="500" y="110" width="34" height="110" />
        <rect x="545" y="130" width="24" height="90" />
        <polygon points="590,220 610,80 630,220" />
        <rect x="670" y="100" width="28" height="120" />
        <polygon points="705,220 705,60 735,90 735,220" />

        {/* second minaret, mirrored */}
        <rect x="820" y="95" width="10" height="125" />
        <polygon points="815,95 825,66 835,95" />
        <rect x="811" y="91" width="28" height="8" />

        {/* right-side towers */}
        <rect x="900" y="145" width="28" height="75" />
        <rect x="940" y="125" width="22" height="95" />
        <rect x="975" y="155" width="32" height="65" />
        <rect x="1060" y="135" width="26" height="85" />
        <rect x="1100" y="160" width="20" height="60" />
      </g>
    </svg>
  );
}
