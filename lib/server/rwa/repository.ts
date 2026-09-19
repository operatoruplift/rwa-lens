import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { addressSchema, clusterSchema, inspectResultSchema, reportIdSchema } from '@/lib/rwa/schema';
import { databaseConfig, sessionsConfigured } from './session';

/** Server-enforced owner isolation. The service role bypasses RLS; our wallet
 * HMAC cookie is not a Supabase JWT. Anonymous table access is separately denied. */
const rowSchema = z.object({
  id: reportIdSchema, cluster: clusterSchema, mint: z.string().min(1).max(64), owner_address: z.string().min(1).max(64).nullable(),
  created_at: z.string().datetime({ offset: true }), decoder_version: z.string().min(1).max(200),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/), mode: z.enum(['live', 'fixture', 'recorded']),
  observation: inspectResultSchema.optional(),
}).strict();
const SELECT = 'id, cluster, mint, owner_address, created_at, decoder_version, content_hash, mode';
function report(value: unknown) {
  const row = rowSchema.parse(value);
  if (row.observation && (hashObservation(row.observation) !== row.content_hash || row.observation.mode !== row.mode || row.observation.provenance.cluster !== row.cluster || row.observation.identity?.mint !== row.mint || row.observation.provenance.decoderVersion !== row.decoder_version)) throw new Error('Stored report failed integrity validation.');
  return { id: row.id, cluster: row.cluster, mint: row.mint, ownerAddress: row.owner_address, createdAt: row.created_at, decoderVersion: row.decoder_version, contentHash: row.content_hash, mode: row.mode, ...(row.observation ? { observation: row.observation } : {}) };
}
export type StoredReport = ReturnType<typeof report>;
export type RepositoryState = 'ready' | 'disabled' | 'misconfigured';
export function reportsEnabled(): boolean { return (process.env.RWA_REPORTS_ENABLED ?? '').trim() === 'true'; }
function serviceClient() {
  const config = databaseConfig();
  if (!config || !sessionsConfigured()) return null;
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function repositoryState(): RepositoryState {
  if (!reportsEnabled()) return 'disabled';
  return databaseConfig() && sessionsConfigured() ? 'ready' : 'misconfigured';
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
/** JSONB may reorder object keys; hash canonical data rather than transport formatting. */
export function hashObservation(observation: unknown): string { return createHash('sha256').update(canonical(observation)).digest('hex'); }
export async function listReports(owner: string): Promise<StoredReport[]> {
  addressSchema.parse(owner);
  const client = serviceClient(); if (!client) throw new Error('Report storage is unavailable.');
  const { data, error } = await client.from('rwa_wallet_reports').select(SELECT).eq('owner_id', owner).order('created_at', { ascending: false }).limit(50);
  if (error || !data) throw new Error('Report storage is unavailable.');
  return data.map(report);
}
export async function getReport(owner: string, id: string): Promise<StoredReport | null> {
  addressSchema.parse(owner); reportIdSchema.parse(id);
  const client = serviceClient(); if (!client) throw new Error('Report storage is unavailable.');
  const { data, error } = await client.from('rwa_wallet_reports').select(`${SELECT}, observation`).eq('owner_id', owner).eq('id', id).maybeSingle();
  if (error) throw new Error('Report storage is unavailable.');
  return data ? report(data) : null;
}
export async function createReport(input: {
  owner: string; cluster: string; mint: string; ownerAddress?: string; observation: unknown; decoderVersion: string; mode: 'live' | 'fixture' | 'recorded';
}): Promise<StoredReport | null> {
  addressSchema.parse(input.owner);
  const observation = inspectResultSchema.parse(input.observation);
  if (observation.provenance.cluster !== input.cluster || observation.identity?.mint !== input.mint || observation.mode !== input.mode || observation.provenance.decoderVersion !== input.decoderVersion) throw new Error('Report identity does not match its observation.');
  const client = serviceClient(); if (!client) throw new Error('Report storage is unavailable.');
  const { data, error } = await client.from('rwa_wallet_reports').insert({
    owner_id: input.owner, cluster: input.cluster, mint: input.mint, owner_address: input.ownerAddress ?? null,
    observation, decoder_version: input.decoderVersion, mode: input.mode, content_hash: hashObservation(observation),
  }).select(SELECT).single();
  if (error) throw new Error('Report storage is unavailable.');
  return data ? report(data) : null;
}
