/** Only follow ?next= links that stay on this site. */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export function loginLink(next: string) {
  return `/login?next=${encodeURIComponent(next)}`
}
