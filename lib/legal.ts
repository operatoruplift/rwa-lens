/** Shared facts for the privacy policy and terms. Change LEGAL_UPDATED with every revision. */
export const OPERATOR = 'Operator Uplift';
export const LEGAL_UPDATED = '7 October 2026';
export const ISSUES_URL = 'https://github.com/operatoruplift/rwa-lens/issues';
export const LEGAL_LINKS = [{ href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }] as const;

export type SupportContact = { kind: 'email' | 'issues'; href: string; label: string };
// A plain address only, so a configured value can never add mailto headers such as cc or bcc.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** NEXT_PUBLIC_SUPPORT_EMAIL when it is a plain address, otherwise the public issue tracker. Never an invented address. */
export function supportContact(value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_EMAIL): SupportContact {
  const email = (value ?? '').trim();
  if (email.length <= 254 && EMAIL.test(email)) return { kind: 'email', href: `mailto:${email}`, label: email };
  return { kind: 'issues', href: ISSUES_URL, label: 'github.com/operatoruplift/rwa-lens/issues' };
}
