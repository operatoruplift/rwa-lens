import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrivacyPage from '@/app/privacy/page';

/** The policy renders on the server from the deployment's flags, so each state can be read as a string. */
function render(): string {
  return renderToStaticMarkup(PrivacyPage()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
function enableReports() {
  vi.stubEnv('RWA_REPORTS_ENABLED', 'true'); vi.stubEnv('RWA_SESSION_SECRET', 's'.repeat(48));
  vi.stubEnv('RWA_APP_ORIGIN', 'https://rwa.example.com'); vi.stubEnv('RWA_SUPABASE_URL', 'https://rwa-dedicated.supabase.co');
  vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
}
afterEach(() => { vi.unstubAllEnvs(); });

describe('privacy policy and the saved-reports flag', () => {
  it('says saved reports are off, nothing is stored per wallet and there is nothing to delete, when they are off', () => {
    vi.stubEnv('RWA_REPORTS_ENABLED', 'false');
    const text = render();
    expect(text).toContain('Saved reports are switched off on this deployment. Nothing is stored per wallet, so there is nothing to delete.');
    expect(text).toContain('RWA Lens sets no cookies on this deployment.');
    expect(text).toContain('Sign-in challenges, sessions and saved reports: none.');
    expect(text).not.toContain('choose Delete my data and confirm');
    // The headings every build must keep, whichever state is on.
    for (const heading of ['Wallet sign-in and saved reports', 'Delete your data', 'How long we keep data']) expect(text).toContain(heading);
  });

  it('keeps the Delete my data instructions when saved reports are on', () => {
    enableReports();
    const text = render();
    expect(text).toContain('choose Delete my data and confirm');
    expect(text).toContain('On this deployment they are on.');
    expect(text).toContain('Saved reports: until you delete them.');
    expect(text).not.toContain('switched off on this deployment');
  });

  it('treats the flag without its durable configuration as off', () => {
    enableReports();
    vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', '');
    expect(render()).toContain('Saved reports are switched off on this deployment.');
  });
});
