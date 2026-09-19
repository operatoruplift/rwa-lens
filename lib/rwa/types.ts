/**
 * RWA Lens domain types.
 *
 * Every on-chain amount stays a decimal string or bigint until the moment it is
 * formatted. No u64, multiplier or supply is ever parsed into a JS number for
 * accounting — only the official Token-2022 display helper does that, and its
 * results are labelled as such.
 */

export type Cluster = 'devnet' | 'mainnet-beta';

export type ObservationStatus = 'verified' | 'partial' | 'unavailable' | 'invalid';

export type Commitment = 'confirmed' | 'finalized';

/** How a displayed amount was produced. Never claim exactness from a helper. */
export type Rounding =
  | 'exact-decimal'
  | 'official-helper'
  | 'rounded-for-display'
  | 'unavailable';

export type SourceStatus = 'ok' | 'failed' | 'skipped';

export type ProvenanceSource = {
  label: string;
  method: string;
  status: SourceStatus;
  detail?: string;
  slot?: string;
  blockTime?: string;
  commitment?: Commitment;
};

export type Provenance = {
  mode: 'live' | 'fixture' | 'recorded';
  cluster: Cluster;
  rpcProvider: string;
  fetchedAt: string;
  slot?: string;
  blockTime?: string;
  commitment: Commitment;
  decoderVersion: string;
  cacheAgeMs?: number;
  /** 'chain' means the Clock sysvar was decoded at clockSlot. */
  timeSource: 'chain' | 'block-time-estimate' | 'local-estimate' | 'fixture';
  clockTimestamp?: string;
  clockSlot?: string;
  observedTimestamp?: string;
  slotSpread?: string;
  sources: ProvenanceSource[];
};

export type TokenProgram = 'token-2022' | 'spl-token' | 'unknown';

export type Identity = {
  mint: string;
  tokenProgram: TokenProgram;
  tokenProgramAddress: string;
  decimals: number;
  supply?: string;
  mintAuthority?: string;
  freezeAuthority?: string;
  isInitialized: boolean;
  /** Issuer-supplied, never on-chain proof. */
  metadata?: {
    name?: string;
    symbol?: string;
    uri?: string;
    uriFetch: 'ok' | 'skipped' | 'blocked' | 'failed' | 'not-configured';
    additional?: Array<{ key: string; value: string }>;
  };
};

export type AccountState = 'initialized' | 'frozen' | 'uninitialized' | 'unknown';

export type RawBalance = {
  tokenAccount: string;
  owner: string;
  /** u64 as a decimal string. Never a JS number. */
  rawAmount: string;
  decimals: number;
  state: AccountState;
  extensions: string[];
};

export type DisplayBalance = {
  rawAmount: string;
  standardUiAmount?: string;
  extensionUiAmount?: string;
  multiplier?: string;
  pendingMultiplier?: string;
  effectiveAt?: string;
  /** Where the observation sits relative to a scheduled multiplier change. */
  boundary?: 'before' | 'at' | 'after' | 'none' | 'unknown';
  rounding: Rounding;
  note?: string;
};

export type Balances = {
  owner?: string;
  accounts: RawBalance[];
  /** False when the provider could not guarantee the account list is whole. */
  complete: boolean;
  accountLimit?: number;
  totalRawAmount: string;
  display: DisplayBalance;
};

export type ExtensionSeverity = 'info' | 'attention' | 'blocking' | 'opaque';

export type ExtensionScope = 'mint' | 'account';

export type DecodedExtension = {
  /** The Token-2022 variant name, or `Unknown(<n>)` for a future variant. */
  kind: string;
  scope: ExtensionScope;
  severity: ExtensionSeverity;
  /** Plain-language holder and integrator impact. */
  impact: string;
  authorities: Array<{ role: string; address: string }>;
  fields: Array<{ label: string; value: string }>;
  /** True when detected but this release cannot safely compute with it. */
  calculationUnavailable: boolean;
  /** True when the extension exists but is not configured to do anything yet. */
  inactive?: boolean;
  byteLength?: number;
};

export type ReadinessVerdict = 'ready' | 'attention' | 'blocked' | 'unknown';

export type ReadinessReason = {
  verdict: ReadinessVerdict;
  check: string;
  detail: string;
  evidence?: string;
};

export type TransferReadiness = {
  verdict: ReadinessVerdict;
  knownBlock?: boolean;
  unknownChecks?: boolean;
  reasons: ReadinessReason[];
  /** Always present. Readiness is an explanation, not an authorisation. */
  disclaimer: string;
};

export type RegistryAsset = {
  issuer?: string;
  assetClass?: string;
  documentationUrl?: string;
  reserveProofUrl?: string;
  jurisdiction?: string;
  redemption?: string;
  source: string;
  fetchedAt: string;
  stale?: boolean;
};

export type InspectRequest =
  | { mode: 'live'; cluster: Cluster; mint: string; owner?: string }
  | { mode: 'fixture'; fixtureId: 'treasury-scaled' | 'credit-hooked' | 'plain-spl'; scenario: 'before' | 'at' | 'after' };

export type InspectResult = {
  status: ObservationStatus;
  mode: 'live' | 'fixture' | 'recorded';
  balanceStatus: 'not-requested' | 'observed' | 'partial' | 'unavailable';
  identity?: Identity;
  balances?: Balances;
  extensions: DecodedExtension[];
  transferReadiness?: TransferReadiness;
  registry?: RegistryAsset | null;
  provenance: Provenance;
  warnings: string[];
  limitations: string[];
  message?: string;
};

export const DECODER_VERSION = '@solana-program/token-2022@0.17.0+rwa-lens.2';

export const READINESS_DISCLAIMER =
  'Transfer readiness describes observed on-chain state only. It is not legal advice and not a guarantee that a transfer will succeed or be permitted.';
