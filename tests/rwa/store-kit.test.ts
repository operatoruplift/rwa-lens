import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The dApp Store listing kit: committed copy within the Portal's limits, and assets of the exact required size. */
const kit = fileURLToPath(new URL('../../docs/dapp-store/', import.meta.url));
const listing = readFileSync(path.join(kit, 'listing.md'), 'utf8');
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

function field(heading: string): string {
  const match = listing.match(new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``));
  if (!match) throw new Error(`listing.md has no "${heading}" block`);
  return match[1];
}

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 8).toString('hex'), `${file} is not a PNG`).toBe('89504e470d0a1a0a');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('dApp Store listing copy', () => {
  it('keeps the name, subtitle and description within the Portal limits', () => {
    expect(field('App name')).toBe('RWA Lens');
    expect(field('App name').length).toBeLessThanOrEqual(25);
    expect(field('Subtitle').length).toBeLessThanOrEqual(30);
    expect(field('Description').length).toBeLessThanOrEqual(10_000);
    expect(field('What\'s new')).toBe('First release');
  });

  it('describes only what this release ships: read-only, no Deploy USDC, no promised returns', () => {
    const description = field('Description');
    expect(description).toContain('Read-only');
    expect(description).toContain('never holds keys or funds');
    // Deploy USDC is off in this release, so the store copy must not describe it; the reviewer note says it is off.
    expect(description).not.toMatch(/deploy usdc|add liquidity|impermanent loss|slippage/i);
    expect(field('Reviewer notes')).toContain('Saved reports and Deploy USDC are switched off in this release.');
    expect(description).not.toMatch(/\b(earn|guaranteed|profit|returns?)\b/i);
  });

  it('points at the canonical site and its legal pages', () => {
    for (const url of ['https://rwalensonsolana.vercel.app', 'https://rwalensonsolana.vercel.app/privacy', 'https://rwalensonsolana.vercel.app/terms']) expect(listing).toContain(`| ${url} |`);
    expect(listing).toContain('© 2026 Operator Uplift');
  });
});

describe('dApp Store assets', () => {
  it('has a banner of exactly 1200×600', () => {
    expect(pngSize(path.join(kit, 'banner-1200x600.png'))).toEqual({ width: 1200, height: 600 });
  });

  it('has 5 or 6 portrait screenshots, each exactly 1080×1920 and under 3 MB', () => {
    const directory = path.join(kit, 'screenshots');
    const files = readdirSync(directory).filter(name => name.endsWith('.png')).sort();
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.length).toBeLessThanOrEqual(6);
    for (const name of files) {
      expect(pngSize(path.join(directory, name)), name).toEqual({ width: 1080, height: 1920 });
      expect(statSync(path.join(directory, name)).size, name).toBeLessThan(MAX_SCREENSHOT_BYTES);
      expect(listing, `${name} is captioned in listing.md`).toContain(`screenshots/${name}`);
    }
  });
});
