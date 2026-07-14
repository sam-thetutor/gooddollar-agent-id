export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="GoodAgent"
    >
      {/* outer fingerprint arc, gap on the right */}
      <path
        d="M38.5 17.2 A16 16 0 1 0 38.5 30.8"
        stroke="#e6b23c"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* middle arc, offset gap */}
      <path
        d="M20.75 32.93 A9.5 9.5 0 1 1 32.23 28.75"
        stroke="#e6b23c"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* G crossbar */}
      <path
        d="M40 24 H30"
        stroke="#eceff3"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* core */}
      <circle cx="24" cy="24" r="2.6" fill="#eceff3" />
    </svg>
  );
}
