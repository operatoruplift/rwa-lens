import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Saved reports.
 *
 * Owner-scoped at two layers: the query always filters by owner, and the
 * database enforces it again with row-level security. A report belonging to
 * someone else is reported as not found, never as forbidden, so an id cannot be
 * probed for existence.
 */

export type StoredReport = {
  id: string;
  cluster: string;
  mint: string;
  ownerAddress: string | null;
  createdAt: string;
  decoderVersion: string;
  contentHash: string;
  observation?: unknown;
};

export type RepositoryState = 'ready' | 'disabled' | 'misconfigured';

export function reportsEnabled(): boolean {
  return (process.env.RWA_REPORTS_ENABLED ?? '').trim() === 'true';
}

function serviceClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
  if (!url || !key.startsWith('sb_secret_')) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function repositoryState(): RepositoryState {
  if (!reportsEnabled()) return 'disabled';
  return serviceClient() ? 'ready' : 'misconfigured';
}

/** Stable hash of the observation, so a stored report can be checked later. */
export function hashObservation(observation: unknown): string {
  return createHash('sha256').update(JSON.stringify(observation ?? null)).digest('hex');
}

export async function listReports(owner: string): Promise<StoredReport[]> {
  const client = serviceClient();
  if (!client) return [];
  const { data, error } = await client
    .from('rwa_reports')
    .select('id, cluster, mint, owner_address, created_at, decoder_version, content_hash')
    .eq('owner_id', owner)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id as string,
    cluster: row.cluster as string,
    mint: row.mint as string,
    ownerAddress: (row.owner_address as string | null) ?? null,
    createdAt: row.created_at as string,
    decoderVersion: row.decoder_version as string,
    contentHash: row.content_hash as string,
  }));
}

export async function getReport(owner: string, id: string): Promise<StoredReport | null> {
  const client = serviceClient();
  if (!client) return null;
  const { data, error } = await client
    .from('rwa_reports')
    .select('id, cluster, mint, owner_address, created_at, decoder_version, content_hash, observation')
    .eq('owner_id', owner)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    cluster: data.cluster as string,
    mint: data.mint as string,
    ownerAddress: (data.owner_address as string | null) ?? null,
    createdAt: data.created_at as string,
    decoderVersion: data.decoder_version as string,
    contentHash: data.content_hash as string,
    observation: data.observation,
  };
}

export async function createReport(input: {
  owner: string;
  cluster: string;
  mint: string;
  ownerAddress?: string;
  observation: unknown;
  decoderVersion: string;
}): Promise<StoredReport | null> {
  const client = serviceClient();
  if (!client) return null;
  // The hash is computed server-side; a client cannot assert what it stored.
  const contentHash = hashObservation(input.observation);
  const { data, error } = await client
    .from('rwa_reports')
    .insert({
      owner_id: input.owner,
      cluster: input.cluster,
      mint: input.mint,
      owner_address: input.ownerAddress ?? null,
      observation: input.observation,
      decoder_version: input.decoderVersion,
      content_hash: contentHash,
    })
    .select('id, cluster, mint, owner_address, created_at, decoder_version, content_hash')
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    cluster: data.cluster as string,
    mint: data.mint as string,
    ownerAddress: (data.owner_address as string | null) ?? null,
    createdAt: data.created_at as string,
    decoderVersion: data.decoder_version as string,
    contentHash: data.content_hash as string,
  };
}
