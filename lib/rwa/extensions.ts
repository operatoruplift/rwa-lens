import type { DecodedExtension, ExtensionScope, ExtensionSeverity } from './types';

/**
 * Maps each Token-2022 extension variant to what it actually means for whoever
 * holds the token. The decoded shapes come from @solana-program/token-2022, so
 * no byte offsets are hand-written here.
 *
 * An unrecognised variant is never dropped: it surfaces as opaque with its
 * identifier, because "we do not know" is a real answer and silence is not.
 */

type ExtensionLike = { __kind: string } & Record<string, unknown>;

type Definition = {
  scope: ExtensionScope;
  severity: ExtensionSeverity;
  impact: string;
  /** Extensions this release detects but cannot safely compute with. */
  calculationUnavailable?: boolean;
  authorities?: (ext: ExtensionLike) => Array<{ role: string; address: string }>;
  fields?: (ext: ExtensionLike) => Array<{ label: string; value: string }>;
  /** Present-but-unset extensions must not be reported as active controls. */
  inactive?: (ext: ExtensionLike) => boolean;
  inactiveImpact?: string;
};

const address = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value === NONE_ADDRESS ? undefined : value;
  // @solana/kit represents Option<Address> as { __option, value }.
  if (value && typeof value === 'object') {
    const option = value as { __option?: string; value?: unknown };
    if (option.__option === 'Some' && typeof option.value === 'string') return option.value === NONE_ADDRESS ? undefined : option.value;
  }
  return undefined;
};

/** The default Address, used by Token-2022 as a "not set" sentinel. */
export const NONE_ADDRESS = '11111111111111111111111111111111';

/** AccountState is a C-style enum; a bare index must not reach the UI as "1". */
const ACCOUNT_STATE_NAMES = ['Uninitialized', 'Initialized', 'Frozen'] as const;

export function accountStateName(value: unknown): string {
  if (typeof value === 'number' && ACCOUNT_STATE_NAMES[value]) return ACCOUNT_STATE_NAMES[value];
  if (typeof value === 'bigint' && ACCOUNT_STATE_NAMES[Number(value)]) return ACCOUNT_STATE_NAMES[Number(value)];
  if (typeof value === 'string') {
    const asIndex = Number(value);
    if (Number.isInteger(asIndex) && ACCOUNT_STATE_NAMES[asIndex]) return ACCOUNT_STATE_NAMES[asIndex];
    return value;
  }
  if (value && typeof value === 'object' && '__kind' in value) {
    return String((value as { __kind: unknown }).__kind);
  }
  return 'unavailable';
}

const text = (value: unknown): string => {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const maybe = address(value);
  if (maybe) return maybe;
  if (value && typeof value === 'object' && '__kind' in value) {
    return String((value as { __kind: unknown }).__kind);
  }
  return 'unavailable';
};

const timestamp = (value: unknown): string => {
  const seconds = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  if (seconds === null) return 'unavailable';
  if (seconds === 0n) return 'Immediately effective (Unix timestamp 0)';
  const date = new Date(Number(seconds) * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : 'unavailable';
};

export const EXTENSION_DEFINITIONS: Record<string, Definition> = {
  ScaledUiAmountConfig: {
    scope: 'mint',
    severity: 'attention',
    impact:
      'Your balance is a raw amount multiplied by an issuer-controlled number. A multiplier update changes display conversion without moving raw tokens; it does not prove yield or investment performance.',
    authorities: ext => {
      const authority = address(ext.authority);
      return authority ? [{ role: 'Multiplier authority', address: authority }] : [];
    },
    fields: ext => [
      { label: 'Stored prior multiplier', value: text(ext.multiplier) },
      { label: 'Scheduled multiplier', value: text(ext.newMultiplier) },
      { label: 'Effective at', value: timestamp(ext.newMultiplierEffectiveTimestamp) },
    ],
  },
  InterestBearingConfig: {
    scope: 'mint',
    severity: 'attention',
    calculationUnavailable: true,
    impact:
      'The displayed amount accrues continuously while the raw amount never moves. This release reports the configuration but does not compute the accrued display value.',
    authorities: ext => {
      const authority = address(ext.rateAuthority);
      return authority ? [{ role: 'Rate authority', address: authority }] : [];
    },
    fields: ext => [
      { label: 'Current rate', value: text(ext.currentRate) },
      { label: 'Pre-update rate', value: text(ext.preUpdateAverageRate) },
    ],
  },
  TransferHook: {
    scope: 'mint',
    severity: 'attention',
    impact:
      'A program runs on every transfer and can reject it. Its conditions are program-specific and are not evaluated here. Whether any particular transfer succeeds depends on that program, which this tool does not execute.',
    inactive: ext => address(ext.programId) === undefined || address(ext.programId) === NONE_ADDRESS,
    inactiveImpact:
      'The transfer-hook extension is present but no hook program is set, so no extra program runs on transfer today. The authority below can set one later.',
    authorities: ext => {
      const authority = address(ext.authority);
      const program = address(ext.programId);
      return [
        ...(authority ? [{ role: 'Hook update authority', address: authority }] : []),
        ...(program ? [{ role: 'Hook program', address: program }] : []),
      ];
    },
  },
  TransferHookAccount: {
    scope: 'account',
    severity: 'info',
    impact: 'Marks whether this account is mid-transfer. It does not restrict you on its own.',
    fields: ext => [{ label: 'Transferring', value: text(ext.transferring) }],
  },
  PermanentDelegate: {
    scope: 'mint',
    severity: 'attention',
    inactive: ext => address(ext.delegate) === undefined,
    inactiveImpact: 'No permanent delegate is configured. This extension does not currently grant a mint-level transfer or burn delegate.',
    impact:
      'This address can transfer or burn your tokens without your signature, and you cannot revoke it. Issuers use it for clawback and forced redemption. Treat it as a custodial control.',
    authorities: ext => {
      const delegate = address(ext.delegate);
      return delegate ? [{ role: 'Permanent delegate', address: delegate }] : [];
    },
  },
  DefaultAccountState: {
    scope: 'mint',
    severity: 'attention',
    impact:
      'New token accounts for this mint arrive in this state. When that state is frozen, a new holder cannot move the token until an authority thaws their account.',
    fields: ext => [{ label: 'Default state', value: accountStateName(ext.state) }],
  },
  NonTransferable: {
    scope: 'mint',
    severity: 'blocking',
    impact: 'This token cannot be transferred at all. It can only be held or burned by its holder.',
  },
  NonTransferableAccount: {
    scope: 'account',
    severity: 'blocking',
    impact: 'This account holds a non-transferable token and cannot send it.',
  },
  TransferFeeConfig: {
    scope: 'mint',
    severity: 'attention',
    impact:
      'A percentage is withheld from every transfer and later harvested by the issuer. The recipient receives less than the amount sent.',
    authorities: ext => {
      const withdraw = address(ext.withdrawWithheldAuthority);
      const config = address(ext.transferFeeConfigAuthority);
      return [
        ...(config ? [{ role: 'Fee config authority', address: config }] : []),
        ...(withdraw ? [{ role: 'Withheld-fee authority', address: withdraw }] : []),
      ];
    },
    fields: ext => [
      { label: 'Withheld amount', value: text(ext.withheldAmount) },
      { label: 'Older fee (bps)', value: text((ext.olderTransferFee as ExtensionLike)?.transferFeeBasisPoints) },
      { label: 'Newer fee (bps)', value: text((ext.newerTransferFee as ExtensionLike)?.transferFeeBasisPoints) },
      { label: 'Older fee epoch', value: text((ext.olderTransferFee as ExtensionLike)?.epoch) },
      { label: 'Newer fee epoch', value: text((ext.newerTransferFee as ExtensionLike)?.epoch) },
      { label: 'Newer maximum fee', value: text((ext.newerTransferFee as ExtensionLike)?.maximumFee) },
    ],
  },
  TransferFeeAmount: {
    scope: 'account',
    severity: 'info',
    impact: 'Previously withheld fees, reported separately from spendable public units. No new fee is applied for holding and these units are not subtracted again.',
    fields: ext => [{ label: 'Withheld amount', value: text(ext.withheldAmount) }],
  },
  MintCloseAuthority: {
    scope: 'mint',
    severity: 'attention',
    impact: 'This authority can close the mint account once supply reaches zero.',
    authorities: ext => {
      const authority = address(ext.closeAuthority);
      return authority ? [{ role: 'Close authority', address: authority }] : [];
    },
  },
  MetadataPointer: {
    scope: 'mint',
    severity: 'info',
    impact: 'Points at where this token’s metadata lives. Metadata is issuer-supplied and is not on-chain proof of anything.',
    authorities: ext => {
      const authority = address(ext.authority);
      const metadata = address(ext.metadataAddress);
      return [
        ...(authority ? [{ role: 'Metadata authority', address: authority }] : []),
        ...(metadata ? [{ role: 'Metadata account', address: metadata }] : []),
      ];
    },
  },
  TokenMetadata: {
    scope: 'mint',
    severity: 'info',
    impact: 'Issuer-declared name, symbol and URI. Descriptive only; it carries no guarantee.',
    fields: ext => [
      { label: 'Name', value: text(ext.name) },
      { label: 'Symbol', value: text(ext.symbol) },
      { label: 'URI', value: text(ext.uri) },
    ],
  },
  CpiGuard: {
    scope: 'account',
    severity: 'info',
    impact: 'Blocks certain actions when this account is used from inside another program, which limits some drain patterns.',
    fields: ext => [{ label: 'Locked', value: text(ext.lockCpi) }],
  },
  ImmutableOwner: {
    scope: 'account',
    severity: 'info',
    impact: 'The owner of this token account can never be changed.',
  },
  MemoTransfer: {
    scope: 'account',
    severity: 'info',
    impact: 'Incoming transfers to this account must carry a memo.',
    fields: ext => [{ label: 'Memo required', value: text(ext.requireIncomingTransferMemos) }],
  },
  PausableConfig: {
    scope: 'mint',
    severity: 'attention',
    impact: 'An authority can pause all transfers of this token. While paused, nobody can move it.',
    authorities: ext => {
      const authority = address(ext.authority);
      return authority ? [{ role: 'Pause authority', address: authority }] : [];
    },
    fields: ext => [{ label: 'Paused', value: text(ext.paused) }],
  },
  PausableAccount: {
    scope: 'account',
    severity: 'info',
    impact: 'This account participates in the mint’s pause control.',
  },
  PermissionedBurn: {
    scope: 'mint',
    severity: 'attention',
    impact: 'Burning requires a specific authority rather than the holder alone.',
    authorities: ext => {
      const authority = address(ext.authority);
      return authority ? [{ role: 'Burn authority', address: authority }] : [];
    },
  },
  GroupPointer: {
    scope: 'mint',
    severity: 'info',
    impact: 'Points at a token-group account that this mint belongs to.',
  },
  GroupMemberPointer: {
    scope: 'mint',
    severity: 'info',
    impact: 'Points at this mint’s membership record within a token group.',
  },
  TokenGroup: { scope: 'mint', severity: 'info', impact: 'This mint defines a token group.' },
  TokenGroupMember: { scope: 'mint', severity: 'info', impact: 'This mint is a member of a token group.' },
  ConfidentialTransferMint: {
    scope: 'mint',
    severity: 'opaque',
    calculationUnavailable: true,
    impact:
      'The mint supports confidential transfers. This capability alone does not prove any holder has an encrypted balance. Account-level encrypted amounts, if present, remain unknown.',
  },
  ConfidentialTransferAccount: {
    scope: 'account',
    severity: 'opaque',
    calculationUnavailable: true,
    impact:
      'This account supports encrypted balances; this does not prove a nonzero encrypted amount. The amount shown here covers only the public portion; the confidential portion is unknown.',
  },
  ConfidentialTransferFee: {
    scope: 'mint',
    severity: 'opaque',
    calculationUnavailable: true,
    impact: 'Confidential transfer fees are configured. Withheld confidential amounts are unknown to this tool.',
  },
  ConfidentialTransferFeeAmount: {
    scope: 'account',
    severity: 'opaque',
    calculationUnavailable: true,
    impact: 'Confidential withheld fees on this account are unknown to this tool.',
  },
  ConfidentialMintBurn: {
    scope: 'mint',
    severity: 'opaque',
    calculationUnavailable: true,
    impact: 'Minting and burning can occur confidentially. Supply changes may not be fully observable.',
  },
};

const UNKNOWN_IMPACT =
  'This mint carries an extension this release does not recognise. It may change how the token behaves. Treat the token as not fully understood until it is reviewed.';

export function describeExtension(raw: unknown, fallbackScope: ExtensionScope): DecodedExtension | null {
  if (!raw || typeof raw !== 'object' || !('__kind' in raw)) return null;
  const ext = raw as ExtensionLike;
  const kind = String(ext.__kind);
  if (kind === 'Uninitialized') return null;

  const definition = EXTENSION_DEFINITIONS[kind];
  if (!definition) {
    return {
      kind,
      scope: fallbackScope,
      severity: 'opaque',
      impact: UNKNOWN_IMPACT,
      authorities: [],
      fields: [{ label: 'Variant', value: kind }, ...(typeof ext.byteLength === 'number' ? [{ label: 'Byte length', value: String(ext.byteLength) }] : [])],
      byteLength: typeof ext.byteLength === 'number' ? ext.byteLength : undefined,
      calculationUnavailable: true,
    };
  }

  const inactive = definition.inactive?.(ext) ?? false;

  return {
    kind,
    scope: definition.scope,
    severity: inactive ? 'info' : definition.severity,
    impact: inactive && definition.inactiveImpact ? definition.inactiveImpact : definition.impact,
    inactive,
    authorities: definition.authorities?.(ext) ?? [],
    fields: (definition.fields?.(ext) ?? []).filter(field => field.value !== 'unavailable'),
    calculationUnavailable: definition.calculationUnavailable ?? false,
  };
}

export function describeExtensions(list: unknown, scope: ExtensionScope): DecodedExtension[] {
  if (!Array.isArray(list)) return [];
  return list.map(item => describeExtension(item, scope)).filter((item): item is DecodedExtension => item !== null);
}

export function findExtension<T extends ExtensionLike>(list: unknown, kind: string): T | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.find(item => item && typeof item === 'object' && (item as ExtensionLike).__kind === kind) as T | undefined;
}
