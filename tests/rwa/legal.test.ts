import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { ISSUES_URL, LEGAL_LINKS, LEGAL_UPDATED, LEGAL_UPDATED_ISO, OPERATOR, supportContact } from '@/lib/legal';

describe('support contact', () => {
  it('uses the public issue tracker when no support email is configured', () => {
    for (const value of [undefined, '', '   ']) expect(supportContact(value)).toEqual({ kind: 'issues', href: ISSUES_URL, label: 'github.com/operatoruplift/rwa-lens/issues' });
    expect(ISSUES_URL).toBe('https://github.com/operatoruplift/rwa-lens/issues');
  });

  it('uses a configured support email as a plain mailto link', () => {
    expect(supportContact(' support@operatoruplift.example ')).toEqual({ kind: 'email', href: 'mailto:support@operatoruplift.example', label: 'support@operatoruplift.example' });
  });

  it('never turns a malformed value into a link with extra mail headers', () => {
    for (const value of ['not-an-email', 'a@b', 'a@b.c?cc=x@y.z', 'a@b.co&bcc=x@y.z', '<a@b.co>', 'a b@c.co', 'javascript:alert(1)//@x.co'])
      expect(supportContact(value).kind).toBe('issues');
  });
});

describe('legal pages', () => {
  it('names the operator and the shared revision date', () => {
    expect(OPERATOR).toBe('Operator Uplift');
    expect(LEGAL_UPDATED).toBe('8 October 2026');
    // The visible date and the <time dateTime> attribute are one date.
    expect(new Date(`${LEGAL_UPDATED_ISO}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(LEGAL_UPDATED);
  });

  it('are linked from the footers and listed in the sitemap', () => {
    expect(LEGAL_LINKS.map(link => link.href)).toEqual(['/privacy', '/terms']);
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain('https://rwalensonsolana.vercel.app/privacy');
    expect(urls).toContain('https://rwalensonsolana.vercel.app/terms');
  });
});
