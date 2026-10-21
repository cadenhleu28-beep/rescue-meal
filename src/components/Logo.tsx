export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.5c-4.7 0-8.5 3.7-8.5 8.4 0 5.6 6.9 11.8 7.7 12.5a1.2 1.2 0 0 0 1.6 0c.8-.7 7.7-6.9 7.7-12.5 0-4.7-3.8-8.4-8.5-8.4z"
        fill="var(--brand)"
      />
      <circle cx="12" cy="9.9" r="4.4" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="9.9" r="1.7" fill="#fff" />
    </svg>
  )
}
