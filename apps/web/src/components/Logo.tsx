export function Logo({ className }: { className?: string }) {
  return (
    <img
      className={className}
      src="/icon-256.png"
      width="24"
      height="24"
      alt="GoodAgent"
      decoding="async"
    />
  );
}
