// PitchFlow mark: a P and a mirrored F set back to back.
export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="PitchFlow logo">
      <rect width="64" height="64" rx="14" fill="#1f7a4d" />
      <text x="16" y="46" fontSize="40" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#ffffff" textAnchor="middle">
        P
      </text>
      <text
        x="48"
        y="46"
        fontSize="40"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="#ffd34d"
        textAnchor="middle"
        transform="scale(-1,1) translate(-96,0)"
      >
        F
      </text>
    </svg>
  );
}
