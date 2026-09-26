import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { address, none, getAddressDecoder, type UnixTimestamp, type Address, type OptionOrNullable } from '@solana/kit';
import { getMintEncoder, getTokenEncoder, getMultisigEncoder, getMultisigSize, TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { getSysvarClockEncoder, SYSVAR_CLOCK_ADDRESS } from '@solana/sysvars';
import { accountState, decodeTokenData, identifyProgram, inspectOnChain, inspectRequest } from '@/lib/server/rwa/inspect';
import { createBoundedTransport, createClient, readAccount, type RpcConfig } from '@/lib/server/rwa/rpc';
import { inspectResultSchema } from '@/lib/rwa/schema';

const MINT = address('A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6');
const OWNER = address('11111111111111111111111111111111');
const ACCOUNT = address('So11111111111111111111111111111111111111112');
const ACCOUNT2 = address('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
const mintBytes = (extensions: Parameters<ReturnType<typeof getMintEncoder>['encode']>[0]['extensions'] = none()) => Uint8Array.from(getMintEncoder().encode({ mintAuthority: none(), supply: 1000000000n, decimals: 6, isInitialized: true, freezeAuthority: none(), extensions }));
const tokenBytes = (over: Partial<Parameters<ReturnType<typeof getTokenEncoder>['encode']>[0]> = {}) => Uint8Array.from(getTokenEncoder().encode({ mint: MINT, owner: OWNER, amount: 1500000n, delegate: none(), state: 1, isNative: none(), delegatedAmount: 0n, closeAuthority: none(), extensions: none(), ...over }));
const encoded = (bytes: ArrayLike<number>, owner: string) => ({ data: [Buffer.from(Uint8Array.from(bytes)).toString('base64'), 'base64'], owner, executable: false, lamports: 1, rentEpoch: 0, space: bytes.length });
const clockBytes = getSysvarClockEncoder().encode({ slot: 100n, epochStartTimestamp: 900n as UnixTimestamp, epoch: 1n, leaderScheduleEpoch: 1n, unixTimestamp: 1000n as UnixTimestamp });
const config: RpcConfig = { cluster: 'mainnet-beta', url: 'https://rpc.example.test', timeoutMs: 1000, maxAccounts: 100, commitment: 'confirmed', provider: 'rpc.example.test' };
type Reply = { program?: string; mint?: Uint8Array | Readonly<Uint8Array>; accounts?: Array<{ pubkey: string; account: ReturnType<typeof encoded> }>; ownerSlot?: number; ownerFailure?: boolean; clockFailure?: boolean; metadataAccount?: ReturnType<typeof encoded> | null; metadataSlot?: number };
function rpcMock(options: Reply = {}) {
  const seen: Array<{ method: string; params: unknown[] }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    const request = JSON.parse(init.body as string); seen.push(request);
    let result: unknown;
    if (request.method === 'getAccountInfo') {
      if (request.params[0] === SYSVAR_CLOCK_ADDRESS) {
        if (options.clockFailure) return Response.json({ jsonrpc: '2.0', id: request.id, result: { context: { slot: 100 }, value: null } });
        result = { context: { slot: 100 }, value: encoded(clockBytes, 'Sysvar1111111111111111111111111111111111111') };
      } else if (request.params[0] === ACCOUNT2 && 'metadataAccount' in options) result = { context: { slot: options.metadataSlot ?? 102 }, value: options.metadataAccount };
      else result = { context: { slot: 100 }, value: encoded(options.mint ?? mintBytes(), options.program ?? TOKEN_PROGRAM_ADDRESS) };
    } else if (request.method === 'getTokenAccountsByOwner') {
      if (options.ownerFailure) return new Response('{}', { status: 503 });
      result = { context: { slot: options.ownerSlot ?? 100 }, value: options.accounts ?? [] };
    } else if (request.method === 'getBlockTime') result = 999;
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  }));
  return seen;
}
beforeEach(() => {
  vi.stubEnv('RWA_RPC_URL', config.url); vi.stubEnv('RWA_CLUSTER', 'mainnet-beta'); vi.stubEnv('RWA_REGISTRY_URL', ''); vi.stubEnv('RWA_INSPECT_CACHE_SECONDS', '0');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('mint and account decoding', () => {
  it('identifies both supported programs and rejects arbitrary owners', () => {
    expect(identifyProgram(TOKEN_PROGRAM_ADDRESS)).toBe('spl-token');
    expect(identifyProgram(TOKEN_2022_PROGRAM_ADDRESS)).toBe('token-2022');
    expect(identifyProgram(OWNER)).toBe('unknown');
    expect(() => decodeTokenData(tokenBytes(), 'mint', 'spl-token')).toThrow();
  });
  it('rejects a valid Token-2022 multisig whose signer bytes resemble an initialized mint', () => {
    const signers = Array.from({ length: 11 }, (_, index) => {
      const bytes = new Uint8Array(32);
      bytes[31] = index + 1;
      if (index === 1) bytes[10] = 1;
      if (index === 5) bytes[2] = 1;
      return getAddressDecoder().decode(bytes);
    });
    const bytes = Uint8Array.from(getMultisigEncoder().encode({ m: 1, n: 6, isInitialized: true, signers }));
    expect(bytes.length).toBe(getMultisigSize());
    expect(() => decodeTokenData(bytes, 'mint', 'token-2022')).toThrow(/multisig/);
    expect(() => decodeTokenData(bytes, 'account', 'token-2022')).toThrow(/multisig/);
  });
  it.each([[0, 'uninitialized'], [1, 'initialized'], [2, 'frozen'], [3, 'unknown']] as const)('maps numeric state %d correctly', (state, name) => expect(accountState(state)).toBe(name));
  it('preserves unknown future TLV IDs and lengths alongside decoded base units', () => {
    const prefix = mintBytes([]);
    const bytes = Uint8Array.from([...prefix, 231, 3, 3, 0, 1, 2, 3]);
    const decoded = decodeTokenData(bytes, 'mint', 'token-2022');
    expect(decoded.extensions).toEqual([{ __kind: 'Unknown(999)', byteLength: 3 }]);
    expect('supply' in decoded && decoded.supply).toBe(1000000000n);
  });
  it('keeps truncated unknown extension evidence without guessing fields', () => {
    const decoded = decodeTokenData(Uint8Array.from([...mintBytes([]), 231, 3, 9, 0, 1]), 'mint', 'token-2022');
    expect(decoded.extensions[0]).toMatchObject({ __kind: 'Unknown(999)', byteLength: 9 });
  });
});

describe('live inspection envelope and accounting', () => {
  it('mint-only is not-requested, with official source attribution separate from decoding', async () => {
    rpcMock();
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(inspectResultSchema.safeParse(result).success).toBe(true);
    expect(result.balanceStatus).toBe('not-requested'); expect(result.balances).toBeUndefined();
    expect(result.registry?.source).toBe('https://docs.ondo.finance/addresses');
    expect(result.provenance).toMatchObject({ mode: 'live', slot: '100', clockSlot: '100', timeSource: 'chain', slotSpread: '0' });
  });
  it('uses the legacy SPL mint filter without invalid combined program filter and aggregates unique accounts', async () => {
    const seen = rpcMock({ accounts: [{ pubkey: ACCOUNT, account: encoded(tokenBytes(), TOKEN_PROGRAM_ADDRESS) }, { pubkey: ACCOUNT2, account: encoded(tokenBytes({ amount: 500000n, state: 2 }), TOKEN_PROGRAM_ADDRESS) }] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(seen.find(call => call.method === 'getTokenAccountsByOwner')!.params[1]).toEqual({ mint: MINT });
    expect(result.balances).toMatchObject({ complete: true, totalRawAmount: '2000000' });
    expect(result.transferReadiness?.knownBlock).toBe(true);
  });
  it('does not double-count duplicate accounts', async () => {
    const entry = { pubkey: ACCOUNT, account: encoded(tokenBytes(), TOKEN_PROGRAM_ADDRESS) };
    rpcMock({ accounts: [entry, entry] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(result.balances).toMatchObject({ complete: false, totalRawAmount: '1500000' });
    expect(result.status).toBe('partial');
  });
  it.each(['owner', 'mint', 'program', 'pubkey', 'decoder', 'executable'])('omits an invalid %s account without inventing zero', async bad => {
    const entry = { pubkey: bad === 'pubkey' ? 'invalid' : ACCOUNT, account: encoded(bad === 'decoder' ? Uint8Array.of(1, 2) : tokenBytes({ ...(bad === 'owner' ? { owner: ACCOUNT2 } : {}), ...(bad === 'mint' ? { mint: ACCOUNT2 } : {}) }), bad === 'program' ? TOKEN_2022_PROGRAM_ADDRESS : TOKEN_PROGRAM_ADDRESS) };
    if (bad === 'executable') entry.account.executable = true;
    rpcMock({ accounts: [entry] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(result.status).toBe('partial'); expect(result.balanceStatus).toBe('unavailable'); expect(result.balances).toBeUndefined();
    expect(result.transferReadiness?.unknownChecks).toBe(true);
  });
  it('distinguishes validated empty owner lookup from unavailable lookup', async () => {
    rpcMock();
    const empty = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(empty.balanceStatus).toBe('observed'); expect(empty.balances?.totalRawAmount).toBe('0');
    rpcMock({ ownerFailure: true });
    const unavailable = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(unavailable.balanceStatus).toBe('unavailable'); expect(unavailable.balances).toBeUndefined(); expect(unavailable.status).toBe('partial');
  });
  it('reports mixed slot and capped owner results as incomplete', async () => {
    vi.stubEnv('RWA_RPC_MAX_ACCOUNTS', '1');
    rpcMock({ ownerSlot: 101, accounts: [{ pubkey: ACCOUNT, account: encoded(tokenBytes(), TOKEN_PROGRAM_ADDRESS) }, { pubkey: ACCOUNT2, account: encoded(tokenBytes(), TOKEN_PROGRAM_ADDRESS) }] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(result.balances?.complete).toBe(false); expect(result.provenance.slotSpread).toBe('1');
    expect(result.provenance.sources.find(source => source.method === 'getTokenAccountsByOwner')?.slot).toBe('101');
  });
  it('binds active multiplier selection and official helper to observed Clock at the scheduled boundary', async () => {
    rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes([{ __kind: 'ScaledUiAmountConfig', authority: OWNER, multiplier: 1.5, newMultiplier: 2, newMultiplierEffectiveTimestamp: 1000n }]), accounts: [{ pubkey: ACCOUNT, account: encoded(tokenBytes(), TOKEN_2022_PROGRAM_ADDRESS) }] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(result.balances?.display).toMatchObject({ rawAmount: '1500000', standardUiAmount: '1.5', multiplier: '2', extensionUiAmount: '3', boundary: 'at', rounding: 'official-helper' });
    expect(result.provenance.clockTimestamp).toBe('1970-01-01T00:16:40.000Z');
  });
  it('preserves raw account units but withholds display for an undecoded mint extension', async () => {
    rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: Uint8Array.from([...mintBytes([]), 25, 0, 56, 0, 1]), accounts: [{ pubkey: ACCOUNT, account: encoded(tokenBytes(), TOKEN_2022_PROGRAM_ADDRESS) }] });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT, owner: OWNER });
    expect(result.status).toBe('partial');
    expect(result.extensions[0]).toMatchObject({ kind: 'Unknown(25)', byteLength: 56 });
    expect(result.balances?.display).toMatchObject({ rawAmount: '1500000', standardUiAmount: '1.5', rounding: 'unavailable', boundary: 'unknown' });
  });
  it('labels block-time fallback as estimated and partial', async () => {
    rpcMock({ clockFailure: true });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(result.provenance.timeSource).toBe('block-time-estimate'); expect(result.provenance.clockTimestamp).toBeUndefined(); expect(result.status).toBe('partial');
  });
  it('explicit offline fixtures satisfy the response schema', async () => {
    vi.stubEnv('RWA_CLUSTER', 'devnet'); vi.stubEnv('RWA_FIXTURES_ENABLED', 'true'); vi.stubEnv('VERCEL_ENV', 'preview');
    rpcMock();
    for (const scenario of ['before', 'at', 'after'] as const) {
      const fixture = await inspectRequest({ mode: 'fixture', fixtureId: 'treasury-scaled', scenario });
      expect(inspectResultSchema.safeParse(fixture).success).toBe(true);
      expect(fixture.balances?.display.rawAmount).toBe('1000000000');
      expect(fixture.balances?.display.boundary).toBe(scenario);
    }
  });
});

describe('bounded transport', () => {
  it('aborts the actual request on its deadline', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => { signal = init.signal!; return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))); }));
    await expect(readAccount(createClient({ ...config, timeoutMs: 10 }), config, MINT)).rejects.toMatchObject({ kind: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });
  it('bounds response bytes while streaming, even without content-length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(100))));
    await expect(createBoundedTransport({ ...config, maxResponseBytes: 20 })({ payload: { method: 'getAccountInfo' } })).rejects.toMatchObject({ kind: 'response-too-large' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries only twice and returns sanitized provider failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret-rpc-key'); }));
    await expect(readAccount(createClient(config), config, MINT)).rejects.toMatchObject({ kind: 'provider-failure', message: 'getAccountInfo failed at the RPC provider.' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});


describe('bounded pointed metadata observations', () => {
  const pointer = (metadataAddress: OptionOrNullable<Address>) => ({ __kind: 'MetadataPointer' as const, authority: none<Address>(), metadataAddress });
  const metadata = (mint: Address = MINT) => ({ __kind: 'TokenMetadata' as const, updateAuthority: none<Address>(), mint, name: 'External treasury description', symbol: 'EXT', uri: 'https://issuer.example/metadata.json', additionalMetadata: new Map<string, string>() });
  it('reads one valid pointer and decodes only the official matching Token-2022 layout', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'issuer.example');
    const seen = rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes([pointer(ACCOUNT2)]), metadataAccount: encoded(mintBytes([metadata(), pointer(ACCOUNT)]), TOKEN_2022_PROGRAM_ADDRESS), metadataSlot: 102 });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(result.identity).toMatchObject({ mint: MINT, supply: '1000000000', metadata: { name: 'External treasury description', symbol: 'EXT', uriFetch: 'skipped' } });
    expect(result.provenance.slotSpread).toBe('2');
    expect(result.provenance.sources).toContainEqual(expect.objectContaining({ label: 'Pointed metadata account', status: 'ok', slot: '102', commitment: 'confirmed' }));
    expect(seen.filter(call => call.method === 'getAccountInfo').map(call => call.params[0])).toEqual([MINT, SYSVAR_CLOCK_ADDRESS, ACCOUNT2]);
    expect(seen.find(call => call.params[0] === ACCOUNT2)!.params[1]).toMatchObject({ encoding: 'base64', minContextSlot: 100 });
  });
  it.each(['unknown-owner', 'executable', 'wrong-mint', 'malformed', 'missing'])('retains core identity when pointed metadata is %s', async problem => {
    const external = encoded(problem === 'malformed' ? Uint8Array.of(1, 2) : mintBytes([metadata(problem === 'wrong-mint' ? ACCOUNT : MINT)]), problem === 'unknown-owner' ? OWNER : TOKEN_2022_PROGRAM_ADDRESS);
    if (problem === 'executable') external.executable = true;
    rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes([pointer(ACCOUNT2)]), metadataAccount: problem === 'missing' ? null : external });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(result.status).toBe('partial');
    expect(result.identity).toMatchObject({ mint: MINT, supply: '1000000000', tokenProgram: 'token-2022' });
    expect(result.identity?.metadata).toBeUndefined();
    expect(result.provenance.sources.some(source => /metadata/i.test(source.label) && source.status !== 'ok')).toBe(true);
  });
  it('keeps the complete response schema valid when embedded metadata text exceeds display limits', async () => {
    rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes([pointer(MINT), { ...metadata(), name: 'x'.repeat(10001) }]) });
    const result = await inspectRequest({ mode: 'live', cluster: 'mainnet-beta', mint: MINT });
    expect(inspectResultSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe('partial');
    expect(result.identity).toMatchObject({ mint: MINT, supply: '1000000000' });
    expect(result.identity?.metadata).toBeUndefined();
    expect(result.extensions.find(extension => extension.kind === 'TokenMetadata')).toMatchObject({ calculationUnavailable: true, fields: [{ label: 'Decode status', value: expect.stringContaining('unavailable') }] });
  });
  it.each([
    ['skipped', 'issuer.example'],
    ['blocked', 'metadata.example.com'],
    ['not-configured', ''],
  ] as const)('records the declared URI host decision as %s without requesting it', async (uriFetch, allowedHosts) => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', allowedHosts);
    const seen = rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes([pointer(MINT), metadata()]) });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(result.identity?.metadata).toMatchObject({ uri: 'https://issuer.example/metadata.json', uriFetch });
    expect(inspectResultSchema.safeParse(result).success).toBe(true);
    // The decision is policy, not a fetch: only the mint and Clock reads happen.
    expect(seen.filter(call => call.method === 'getAccountInfo')).toHaveLength(2);
  });
  it.each(['unset', 'self'])('avoids another RPC read for a %s pointer', async kind => {
    const extensions = kind === 'self' ? [pointer(MINT), metadata()] : [pointer(none())];
    const seen = rpcMock({ program: TOKEN_2022_PROGRAM_ADDRESS, mint: mintBytes(extensions) });
    const result = await inspectOnChain({ cluster: 'mainnet-beta', mint: MINT });
    expect(result.status).toBe('verified');
    expect(seen.filter(call => call.method === 'getAccountInfo')).toHaveLength(2);
    expect(result.provenance.sources.find(source => source.method === 'getAccountInfo(metadata)')?.status).toBe('skipped');
  });
});
