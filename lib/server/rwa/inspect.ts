import 'server-only';
import { fixturesEnabled } from './config';
import { TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS, getMintDecoder, getTokenDecoder, getMintSize, getTokenSize, getMultisigSize, getExtensionDecoder } from '@solana-program/token-2022';
import { getU16Decoder } from '@solana/kit';
import { buildDisplayBalance, sumRawAmounts } from '@/lib/rwa/balance';
import { describeExtensions, accountStateName, findExtension, NONE_ADDRESS } from '@/lib/rwa/extensions';
import { evaluateReadiness } from '@/lib/rwa/readiness';
import { getFixture, treasuryAtBoundary } from '@/lib/rwa/fixtures';
import { addressSchema, inspectResultSchema } from '@/lib/rwa/schema';
import { DECODER_VERSION } from '@/lib/rwa/types';
import type { AccountState, Cluster, Identity, InspectRequest, InspectResult, ProvenanceSource, RawBalance, TokenProgram } from '@/lib/rwa/types';
import { RpcError, createClient, readAccount, readChainTime, readOwnerTokenAccounts, resolveRpcConfig } from './rpc';
import { metadataUriPolicy } from './metadata-fetch';
import { lookupRegistry } from './registry';

const BASE_LIMITATIONS = [
  'Public inspection performs no on-chain writes. Optional report sign-in uses a wallet message only.',
  'Raw units use exact integer arithmetic. Scaled display uses the official floating-point helper.',
  'Issuer metadata is descriptive only, not proof of reserves, compliance or legal transferability.',
  'RPC reads are not atomic. minContextSlot bounds staleness; it does not create a snapshot. The standard owner RPC has no pagination or proof of provider completeness.',
];
function optionValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '__option' in value && value.__option === 'Some' && 'value' in value && typeof value.value === 'string') return value.value;
}
export function identifyProgram(owner: string): TokenProgram {
  return owner === TOKEN_2022_PROGRAM_ADDRESS ? 'token-2022' : owner === TOKEN_PROGRAM_ADDRESS ? 'spl-token' : 'unknown';
}
export function accountState(state: unknown): AccountState {
  const value = accountStateName(state).toLowerCase();
  return value === 'initialized' || value === 'frozen' || value === 'uninitialized' ? value : 'unknown';
}
type RawExtension = { __kind: string } & Record<string, unknown>;
/**
 * Official codecs decode all supported fields. The fallback only frames TLV headers
 * with SDK u16 codecs, preserving a future variant's identifier and byte length.
 * Region boundaries come from official getMintSize/getTokenSize, not copied offsets.
 */
export function decodeTokenData(bytes: Uint8Array, scope: 'mint' | 'account', tokenProgram: TokenProgram) {
  // Token-2022 reserves this size for multisigs, even if signer bytes resemble mint fields.
  if (bytes.length === getMultisigSize()) throw new RpcError('not-a-mint', 'This account has the reserved multisig layout, not a mint or token account.');
  const baseSize = scope === 'mint' ? getMintSize() : getTokenSize();
  const extendedSize = scope === 'mint' ? getMintSize([]) : getTokenSize([]);
  if (bytes.length < baseSize || (tokenProgram === 'spl-token' && bytes.length !== baseSize) || (bytes.length !== baseSize && bytes.length < extendedSize)) throw new RpcError('not-a-mint', 'The account does not have the expected token account layout.');
  if (bytes.length > baseSize && bytes[extendedSize - 1] !== (scope === 'mint' ? 1 : 2)) throw new RpcError('not-a-mint', 'The account type does not match the requested token layout.');
  const base = scope === 'mint' ? getMintDecoder().decode(bytes.slice(0, baseSize)) : getTokenDecoder().decode(bytes.slice(0, baseSize));
  const extensions: RawExtension[] = [];
  if (bytes.length > baseSize) {
    let offset = extendedSize;
    const header = getU16Decoder();
    while (offset < bytes.length) {
      if (bytes.length - offset < header.fixedSize) {
        if (bytes.slice(offset).some(byte => byte !== 0)) extensions.push({ __kind: 'Unknown(truncated)', byteLength: bytes.length - offset });
        break;
      }
      const [id, afterId] = header.read(bytes, offset);
      if (id === 0) break;
      if (afterId + header.fixedSize > bytes.length) { extensions.push({ __kind: `Unknown(${id})`, byteLength: bytes.length - afterId }); break; }
      const [length, start] = header.read(bytes, afterId);
      const end = start + length;
      if (end > bytes.length) { extensions.push({ __kind: `Unknown(${id})`, byteLength: length }); break; }
      try { extensions.push(getExtensionDecoder().decode(bytes.slice(offset, end)) as RawExtension); }
      catch { extensions.push({ __kind: `Unknown(${id})`, byteLength: length }); }
      offset = end;
    }
  }
  return { ...base, extensions };
}
export type InspectInput = { cluster: Cluster; mint: string; owner?: string };

export async function inspectOnChain(input: InspectInput): Promise<InspectResult> {
  const config = resolveRpcConfig(input.cluster);
  const client = createClient(config);
  const fetchedAt = new Date().toISOString();
  const sources: ProvenanceSource[] = [];
  const warnings: string[] = [];
  const account = await readAccount(client, config, input.mint);
  const programOwner = String(account.owner);
  const tokenProgram = identifyProgram(programOwner);
  sources.push({ label: 'Mint account', method: 'getAccountInfo', status: 'ok', slot: account.slot.toString(), commitment: config.commitment, detail: `owner ${programOwner}` });
  if (tokenProgram === 'unknown' || account.executable) throw new RpcError('not-a-mint', 'That account is not a mint owned by a supported Solana token program.');
  let mint: ReturnType<typeof getMintDecoder> extends { decode: (...args: never[]) => infer T } ? Omit<T, 'extensions'> & { extensions: RawExtension[] } : never;
  try {
    const decoded = decodeTokenData(Buffer.from(account.data[0], 'base64'), 'mint', tokenProgram);
    if (!('decimals' in decoded)) throw new Error();
    mint = decoded;
    if (!mint.isInitialized) throw new RpcError('not-a-mint', 'This mint account is not initialized.');
    sources.push({ label: 'Mint decoder', method: 'getMintDecoder + getExtensionDecoder', status: 'ok', slot: account.slot.toString() });
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError('decoder-failure', 'The mint account could not be decoded by this release.');
  }
  const time = await readChainTime(client, config, account.slot);
  sources.push(...time.sources);
  if (time.timeSource !== 'chain') warnings.push(`Clock sysvar was unavailable. Scheduled display conversion uses ${time.timeSource}; it is an estimate, not a chain-verified timestamp.`);
  const identity: Identity = { mint: input.mint, tokenProgram, tokenProgramAddress: programOwner, decimals: mint.decimals, supply: mint.supply.toString(), mintAuthority: optionValue(mint.mintAuthority), freezeAuthority: optionValue(mint.freezeAuthority), isInitialized: mint.isInitialized };
  const tokenMetadata = findExtension(mint.extensions, 'TokenMetadata');
  let metadataUnavailable = false;
  let embeddedMetadataInvalid = false;
  let metadataSlot: bigint | undefined;
  const applyMetadata = (metadata: RawExtension) => {
    if (metadata.mint !== input.mint) throw new RpcError('decoder-failure', 'Metadata mint does not match the inspected mint.');
    if (typeof metadata.name !== 'string' || metadata.name.length > 200 || typeof metadata.symbol !== 'string' || metadata.symbol.length > 40 || typeof metadata.uri !== 'string' || metadata.uri.length > 2048) throw new RpcError('decoder-failure', 'Token metadata exceeds the supported display limits.');
    const uri = typeof metadata.uri === 'string' && metadata.uri ? metadata.uri : undefined;
    // The host decision is recorded with the observation, so the client states it
    // without a request that the policy would decline anyway.
    identity.metadata = { name: typeof metadata.name === 'string' ? metadata.name : undefined, symbol: typeof metadata.symbol === 'string' ? metadata.symbol : undefined, uri, uriFetch: uri ? metadataUriPolicy(uri).state : 'skipped' };
  };
  if (tokenMetadata) {
    try { applyMetadata(tokenMetadata); }
    catch {
      metadataUnavailable = true;
      embeddedMetadataInvalid = true;
      warnings.push('Embedded metadata failed mint binding or supported display limits and was not used as its identity.');
      sources.push({ label: 'Embedded token metadata', method: 'getExtensionDecoder(TokenMetadata)', status: 'failed', slot: account.slot.toString(), detail: 'Metadata mint binding or display validation failed.' });
    }
  }
  const extensions = describeExtensions(mint.extensions, 'mint').map(extension => {
    if (extension.kind !== 'TokenMetadata' || !embeddedMetadataInvalid) return extension;
    return { ...extension, calculationUnavailable: true, fields: [{ label: 'Decode status', value: 'Metadata fields unavailable: mint binding or supported display limits failed.' }] };
  });
  const pointer = findExtension(mint.extensions, 'MetadataPointer');
  const metadataAddress = pointer ? optionValue(pointer.metadataAddress) : undefined;
  if (pointer && (!metadataAddress || metadataAddress === NONE_ADDRESS)) {
    sources.push({ label: 'Metadata pointer', method: 'getAccountInfo(metadata)', status: 'skipped', detail: 'No metadata account is configured.' });
  } else if (metadataAddress === input.mint) {
    sources.push({ label: 'Metadata pointer', method: 'getAccountInfo(metadata)', status: 'skipped', slot: account.slot.toString(), detail: 'Self-pointer: reused the mint account observation without a second read.' });
    if (!identity.metadata) { metadataUnavailable = true; warnings.push('The metadata self-pointer has no usable embedded TokenMetadata.'); }
  } else if (metadataAddress) {
    // One account hop through the configured provider only. The interface does
    // not define every owner's storage layout, so custom layouts stay opaque.
    try {
      if (!addressSchema.safeParse(metadataAddress).success) throw new RpcError('invalid-address', 'The metadata pointer is not a valid account address.');
      const pointed = await readAccount(client, config, metadataAddress, account.slot);
      metadataSlot = pointed.slot;
      const bytes = Buffer.from(pointed.data[0], 'base64');
      const observed = `account ${metadataAddress}; owner ${pointed.owner}; ${bytes.length} bytes`;
      sources.push({ label: 'Pointed metadata account', method: 'getAccountInfo(metadata)', status: 'ok', slot: pointed.slot.toString(), commitment: config.commitment, detail: observed });
      if (pointed.executable || pointed.owner !== TOKEN_2022_PROGRAM_ADDRESS) {
        metadataUnavailable = true;
        sources.push({ label: 'Pointed metadata decoder', method: 'getExtensionDecoder(TokenMetadata)', status: 'skipped', slot: pointed.slot.toString(), detail: `Unsupported ${pointed.executable ? 'executable account' : 'owner layout'}; ${observed}. No arbitrary program layout is inferred.` });
        warnings.push('The pointed metadata account was observed, but its owner/layout is unsupported. Core mint identity is retained.');
      } else {
        const decoded = decodeTokenData(bytes, 'mint', 'token-2022');
        const metadata = findExtension(decoded.extensions, 'TokenMetadata');
        if (!('isInitialized' in decoded) || !decoded.isInitialized || !metadata) throw new RpcError('decoder-failure', 'Pointed account has no supported initialized TokenMetadata layout.');
        applyMetadata(metadata);
        sources.push({ label: 'Pointed metadata decoder', method: 'getExtensionDecoder(TokenMetadata)', status: 'ok', slot: pointed.slot.toString(), detail: `Official Token-2022 mint layout; metadata mint matches ${input.mint}. No pointer chaining or URI fetch performed.` });
      }
    } catch (error) {
      metadataUnavailable = true;
      sources.push({ label: 'Pointed metadata unavailable', method: metadataSlot === undefined ? 'getAccountInfo(metadata)' : 'getExtensionDecoder(TokenMetadata)', status: 'failed', slot: metadataSlot?.toString(), detail: error instanceof RpcError ? error.kind : 'decoder-failure' });
      warnings.push('The pointed metadata account could not be read or safely decoded. Core mint identity remains available.');
    }
  }
  if (tokenProgram === 'spl-token') warnings.push('This is a legacy SPL mint. Token-2022 extensions do not apply.');
  if (extensions.some(ext => ext.kind.startsWith('Unknown('))) warnings.push('One or more extension payloads could not be decoded. Their numeric type and byte length are preserved.');
  const accountsOut: RawBalance[] = [];
  let balances: InspectResult['balances'];
  let balanceStatus: InspectResult['balanceStatus'] = input.owner ? 'unavailable' : 'not-requested';
  let complete = true;
  let ownerSlot: bigint | undefined;
  if (input.owner) {
    try {
      const owned = await readOwnerTokenAccounts(client, config, input.owner, input.mint, programOwner, account.slot);
      ownerSlot = owned.slot;
      complete = owned.complete;
      if (!complete) warnings.push(`Owner response exceeded the ${owned.limit}-account processing cap; the total is partial.`);
      const seen = new Set<string>();
      for (const entry of owned.accounts) {
        if (seen.has(entry.pubkey)) { complete = false; warnings.push(`Duplicate token account ${entry.pubkey} was counted once; provider completeness is uncertain.`); continue; }
        seen.add(entry.pubkey);
        try {
          if (entry.owner !== programOwner || entry.executable || !addressSchema.safeParse(entry.pubkey).success) throw new Error('wrong program or account address');
          const decoded = decodeTokenData(Buffer.from(entry.data, 'base64'), 'account', tokenProgram);
          if (!('amount' in decoded) || decoded.owner !== input.owner || decoded.mint !== input.mint) throw new Error('wrong token identity');
          const state = accountState(decoded.state);
          const accountExtensions = describeExtensions(decoded.extensions, 'account');
          accountsOut.push({ tokenAccount: entry.pubkey, owner: input.owner, rawAmount: decoded.amount.toString(), decimals: mint.decimals, state, extensions: accountExtensions.map(item => item.kind) });
          for (const extension of accountExtensions) extensions.push({ ...extension, fields: [{ label: 'Token account', value: entry.pubkey }, ...extension.fields] });
          if (state === 'unknown' || state === 'uninitialized' || accountExtensions.some(ext => ext.kind.startsWith('Unknown('))) complete = false;
        } catch {
          complete = false;
          warnings.push(`Token account ${entry.pubkey} failed owner/mint/program or decoder validation. Its amount is omitted and unknown, never zero.`);
          sources.push({ label: `Token account ${entry.pubkey}`, method: 'getTokenDecoder', status: 'failed', slot: owned.slot.toString(), detail: 'Account identity or decoding failure' });
        }
      }
      if (ownerSlot !== account.slot) { complete = false; warnings.push('Mint and owner accounts were read at different slots. The aggregate is a mixed-slot observation, not an atomic snapshot.'); }
      const totalRawAmount = sumRawAmounts(accountsOut);
      // A validated empty response means zero. A wholly undecodable nonempty response does not.
      if (accountsOut.length > 0 || owned.accounts.length === 0) {
        balances = { owner: input.owner, accounts: accountsOut, complete, accountLimit: owned.limit, totalRawAmount, display: buildDisplayBalance({ totalRawAmount, decimals: mint.decimals, mintExtensions: mint.extensions, unknownAccountExtensions: extensions.some(extension => extension.scope === 'account' && extension.kind.startsWith('Unknown(')), observedSeconds: time.observedSeconds }) };
        balanceStatus = complete ? 'observed' : 'partial';
      }
      sources.push({ label: 'Owner token accounts', method: 'getTokenAccountsByOwner', status: 'ok', slot: owned.slot.toString(), commitment: config.commitment, detail: `${accountsOut.length} validated unique account(s); mint filter; token program ${programOwner}` });
    } catch (error) {
      complete = false;
      sources.push({ label: 'Owner token accounts', method: 'getTokenAccountsByOwner', status: 'failed', detail: error instanceof RpcError ? error.kind : 'provider-failure' });
      warnings.push('The owner balance is unavailable. No zero total has been inferred. Mint identity remains a live observation.');
    }
  }
  const scaled = findExtension(mint.extensions, 'ScaledUiAmountConfig');
  if (scaled && time.timeSource !== 'chain' && typeof scaled.newMultiplierEffectiveTimestamp === 'bigint' && (scaled.newMultiplierEffectiveTimestamp - time.observedSeconds) ** 2n <= 3600n) warnings.push('The estimated observation is within 60 seconds of a scheduled multiplier boundary. The active multiplier is uncertain.');
  const slots = [account.slot, ...(time.clockSlot === undefined ? [] : [time.clockSlot]), ...(ownerSlot === undefined ? [] : [ownerSlot]), ...(metadataSlot === undefined ? [] : [metadataSlot])];
  const minSlot = slots.reduce((a, b) => a < b ? a : b); const maxSlot = slots.reduce((a, b) => a > b ? a : b);
  const timestamp = new Date(Number(time.observedSeconds) * 1000).toISOString();
  const registry = await lookupRegistry(input.mint, input.cluster);
  return {
    status: sources.some(source => source.status === 'failed') || metadataUnavailable || !complete || extensions.some(ext => ext.kind.startsWith('Unknown(')) || balances?.display.rounding === 'unavailable' ? 'partial' : 'verified',
    mode: 'live', balanceStatus, identity, balances, extensions, transferReadiness: evaluateReadiness(extensions, accountsOut, complete, { freezeAuthority: identity.freezeAuthority }), registry,
    provenance: { mode: 'live', cluster: input.cluster, rpcProvider: config.provider, fetchedAt, slot: account.slot.toString(), commitment: config.commitment, decoderVersion: DECODER_VERSION, timeSource: time.timeSource, clockTimestamp: time.timeSource === 'chain' ? timestamp : undefined, clockSlot: time.clockSlot?.toString(), observedTimestamp: timestamp, blockTime: time.blockTime === null ? undefined : new Date(Number(time.blockTime) * 1000).toISOString(), slotSpread: (maxSlot - minSlot).toString(), sources },
    warnings, limitations: BASE_LIMITATIONS,
  };
}

const inspectionCache = new Map<string, { expiresAt: number; savedAt: number; result: InspectResult }>();
/** Canonical server-generated response for the API and owner-scoped report creation. */
export async function inspectRequest(input: InspectRequest): Promise<InspectResult> {
  if (input.mode === 'fixture') {
    if (!fixturesEnabled()) throw new RpcError('not-configured', 'Only live network inspections are enabled on this deployment.');
    const fixture = getFixture(input.fixtureId);
    if (!fixture) throw new RpcError('invalid-address', 'Unknown fixture.');
    return inspectResultSchema.parse(input.fixtureId === 'treasury-scaled' ? treasuryAtBoundary(input.scenario) : fixture.result);
  }
  const config = resolveRpcConfig(input.cluster);
  const key = JSON.stringify([config.url, input.cluster, input.mint, input.owner ?? null, DECODER_VERSION]);
  const cached = inspectionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.result, provenance: { ...cached.result.provenance, cacheAgeMs: Date.now() - cached.savedAt } };
  const result = inspectResultSchema.parse(await inspectOnChain(input));
  const seconds = Math.min(60, Math.max(0, Number(process.env.RWA_INSPECT_CACHE_SECONDS ?? 15) || 0));
  if (result.status === 'verified' && seconds > 0) {
    if (inspectionCache.size >= 100) inspectionCache.delete(inspectionCache.keys().next().value!);
    inspectionCache.set(key, { result, savedAt: Date.now(), expiresAt: Date.now() + seconds * 1000 });
  }
  return result;
}
