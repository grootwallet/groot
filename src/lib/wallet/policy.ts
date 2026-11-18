import type {
  PolicyPathCoinStatus,
  PolicyPathDefinition,
  PolicyRenewalRecommendation,
  ReceiveAddress,
  Utxo
} from '$lib/types';
import type { CoinSelection } from './contracts';
import type { SupportedNetwork } from '$lib/config';
import type { WalletSnapshot } from './contracts';
import type { MultisigWallet } from './contracts';

// Browser policy mirrors Rust's registry choices; shared contract fixtures test parity.
export const INACTIVITY_TIMEOUT_CHOICES: readonly number[] = [1, 5, 15, 30, 60];

export type WalletPolicyPresentation = {
  delayed: boolean;
  primaryThreshold: number;
  primarySignerCount: number;
  delayedKeyLabel: 'Recovery key' | 'Heir key' | null;
  summary: string;
};

export function hasMiniscriptPolicy(
  wallet: Pick<MultisigWallet, 'recoveryTemplate'> | { recoveryTemplate: null } | null | undefined
): boolean {
  return wallet?.recoveryTemplate != null;
}

export function isContinuityPolicyType(type: string | undefined): boolean {
  return type === 'partner_continuity_v1' || type === 'family_continuity_v1';
}

/** Maps native policy role codes to stable, localizable presentation labels. */
export function policySignerRoleLabel(role: string): string {
  switch (role) {
    case 'primary':
      return 'Primary signer';
    case 'recovery':
      return 'Recovery signer';
    case 'heir':
      return 'Heir signer';
    case 'owner':
      return 'Owner signer';
    case 'partner':
      return 'Partner signer';
    case 'estate_guardian':
      return 'Estate guardian';
    case 'parent':
      return 'Parent';
    case 'child_assistance':
      return 'Child assistance signer';
    case 'child_inheritance':
      return 'Child inheritance signer';
    case 'executor':
      return 'Executor';
    case 'policy_signer':
      return 'Policy signer';
    default:
      return 'Signer role unavailable';
  }
}

export type PolicyPathRow = {
  definition: PolicyPathDefinition;
  status: PolicyPathCoinStatus;
};

const VALID_POLICY_STATES = new Set(['available', 'waiting', 'unconfirmed', 'unknown']);
const VALID_POLICY_BLOCKERS = new Set(['frozen', 'stale_chain']);

function validBoundedInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

/**
 * Validates the native, wallet-wide policy-path contract before presentation.
 * This deliberately checks structure only: Rust remains the source of the path
 * names, delays, roles, and signer membership.
 */
export function validPolicyPathDefinitions(
  definitions: PolicyPathDefinition[] | null | undefined
): PolicyPathDefinition[] {
  if (!definitions?.length || definitions.length > 16) return [];
  const definitionCodes = new Set<string>();
  const definitionIndices = new Set<number>();
  let previousDelay = -1;
  const validated: PolicyPathDefinition[] = [];
  for (const definition of definitions) {
    if (
      !validBoundedInteger(definition.index, 15) ||
      definition.index !== validated.length ||
      definitionIndices.has(definition.index) ||
      !definition.code ||
      definition.code.length > 64 ||
      definitionCodes.has(definition.code) ||
      !definition.name ||
      Array.from(definition.name).length > 96 ||
      !validBoundedInteger(definition.required, 8) ||
      definition.required < 1 ||
      !validBoundedInteger(definition.availableAfterBlocks, 65_535) ||
      definition.availableAfterBlocks < previousDelay ||
      !Array.isArray(definition.eligibleSignerFingerprints) ||
      definition.eligibleSignerFingerprints.length < definition.required ||
      definition.eligibleSignerFingerprints.length > 8 ||
      definition.eligibleSignerFingerprints.some(
        (fingerprint) => !/^[0-9a-f]{8}$/i.test(fingerprint)
      ) ||
      !Array.isArray(definition.signerGroups) ||
      definition.signerGroups.length < 1 ||
      definition.signerGroups.length > 4
    )
      return [];
    const groupCodes = new Set<string>();
    const groupFingerprints = new Set<string>();
    let groupRequirement = 0;
    for (const group of definition.signerGroups) {
      if (
        !group.code ||
        group.code.length > 64 ||
        groupCodes.has(group.code) ||
        !group.label ||
        Array.from(group.label).length > 64 ||
        !validBoundedInteger(group.required, 8) ||
        group.required < 1 ||
        !Array.isArray(group.signers) ||
        group.signers.length < group.required ||
        group.signers.length > 8
      )
        return [];
      groupCodes.add(group.code);
      groupRequirement += group.required;
      for (const signer of group.signers) {
        if (
          !signer.label ||
          Array.from(signer.label).length > 48 ||
          !/^[0-9a-f]{8}$/i.test(signer.fingerprint) ||
          !signer.role ||
          signer.role.length > 64
        )
          return [];
        const fingerprint = signer.fingerprint.toLowerCase();
        if (groupFingerprints.has(fingerprint)) return [];
        groupFingerprints.add(fingerprint);
      }
    }
    const eligible = new Set(
      definition.eligibleSignerFingerprints.map((fingerprint) => fingerprint.toLowerCase())
    );
    if (
      groupRequirement !== definition.required ||
      eligible.size !== groupFingerprints.size ||
      [...eligible].some((fingerprint) => !groupFingerprints.has(fingerprint))
    )
      return [];
    definitionCodes.add(definition.code);
    definitionIndices.add(definition.index);
    previousDelay = definition.availableAfterBlocks;
    validated.push(definition);
  }
  return validated;
}

export function validPolicyPathRows(
  coin: Utxo,
  definitions: PolicyPathDefinition[] | null | undefined
): PolicyPathRow[] {
  const statuses = coin.policyPathStatuses;
  const validatedDefinitions = validPolicyPathDefinitions(definitions);
  if (!validatedDefinitions.length || !statuses?.length) return [];
  if (statuses.length !== validatedDefinitions.length) return [];
  const statusByIndex = new Map<number, PolicyPathCoinStatus>();
  for (const status of statuses) {
    if (
      !validBoundedInteger(status.pathIndex, 15) ||
      statusByIndex.has(status.pathIndex) ||
      !VALID_POLICY_STATES.has(status.policyState) ||
      !validBoundedInteger(status.ageBlocks) ||
      (status.blocksUntilBroadcastEligible !== null &&
        !validBoundedInteger(status.blocksUntilBroadcastEligible)) ||
      (status.confirmationHeight !== null && !validBoundedInteger(status.confirmationHeight)) ||
      (status.earliestInclusionHeight !== null &&
        !validBoundedInteger(status.earliestInclusionHeight)) ||
      (status.approximateSecondsRemaining !== null &&
        !validBoundedInteger(status.approximateSecondsRemaining)) ||
      !Array.isArray(status.actionBlockers) ||
      new Set(status.actionBlockers).size !== status.actionBlockers.length ||
      status.actionBlockers.some((blocker) => !VALID_POLICY_BLOCKERS.has(blocker))
    )
      return [];
    statusByIndex.set(status.pathIndex, status);
  }
  const rows: PolicyPathRow[] = [];
  for (const definition of validatedDefinitions) {
    const status = statusByIndex.get(definition.index);
    if (!status) return [];
    const delayed = definition.availableAfterBlocks > 0;
    const confirmed = status.ageBlocks > 0;
    const expectedRemaining = !delayed
      ? 0
      : confirmed
        ? Math.max(0, definition.availableAfterBlocks - status.ageBlocks)
        : null;
    const expectedEstimate = expectedRemaining === null ? null : expectedRemaining * 600;
    if (
      status.ageBlocks !== coin.confirmations ||
      status.blocksUntilBroadcastEligible !== expectedRemaining ||
      status.approximateSecondsRemaining !== expectedEstimate ||
      (confirmed && status.confirmationHeight === null) ||
      (!confirmed && status.confirmationHeight !== null) ||
      (status.confirmationHeight === null
        ? status.earliestInclusionHeight !== null
        : delayed
          ? status.earliestInclusionHeight !==
            status.confirmationHeight + definition.availableAfterBlocks
          : status.earliestInclusionHeight !== null) ||
      (!delayed && status.policyState !== 'available') ||
      (delayed &&
        (status.actionBlockers.includes('stale_chain')
          ? status.policyState !== 'unknown'
          : !confirmed
            ? status.policyState !== 'unconfirmed'
            : expectedRemaining === 0
              ? status.policyState !== 'available'
              : status.policyState !== 'waiting'))
    )
      return [];
    rows.push({ definition, status });
  }
  return rows;
}

/** Validates the native per-coin renewal projection against the same snapshot tip. */
export function validPolicyRenewalRecommendation(
  coin: Utxo,
  tipHeight: number
): PolicyRenewalRecommendation | null {
  const recommendation = coin.policyRenewalRecommendation;
  if (!recommendation || !validBoundedInteger(tipHeight)) return null;
  if (
    !validBoundedInteger(recommendation.recommendedAtAgeBlocks, 65_535) ||
    recommendation.recommendedAtAgeBlocks < 1 ||
    !validBoundedInteger(coin.confirmations) ||
    (recommendation.remainingBlocks !== null &&
      !validBoundedInteger(recommendation.remainingBlocks)) ||
    (recommendation.recommendedAtHeight !== null &&
      !validBoundedInteger(recommendation.recommendedAtHeight)) ||
    (recommendation.approximateSecondsRemaining !== null &&
      !validBoundedInteger(recommendation.approximateSecondsRemaining)) ||
    typeof recommendation.due !== 'boolean'
  )
    return null;
  const confirmed = coin.confirmations > 0;
  const expectedRemaining = confirmed
    ? Math.max(0, recommendation.recommendedAtAgeBlocks - coin.confirmations)
    : null;
  const expectedHeight = confirmed
    ? tipHeight + recommendation.recommendedAtAgeBlocks - coin.confirmations
    : null;
  const expectedSeconds = expectedRemaining === null ? null : expectedRemaining * 600;
  if (
    (expectedHeight !== null && (!Number.isSafeInteger(expectedHeight) || expectedHeight < 0)) ||
    recommendation.remainingBlocks !== expectedRemaining ||
    recommendation.recommendedAtHeight !== expectedHeight ||
    recommendation.approximateSecondsRemaining !== expectedSeconds ||
    recommendation.due !== (confirmed && expectedRemaining === 0)
  )
    return null;
  return recommendation;
}

export function walletPolicyPresentation(wallet: MultisigWallet): WalletPolicyPresentation {
  const template = wallet.recoveryTemplate;
  if (template?.type === 'partner_continuity_v1' || template?.type === 'family_continuity_v1') {
    const primary = template.type === 'partner_continuity_v1' ? template.owner : template.parents;
    return {
      delayed: true,
      primaryThreshold: primary.threshold,
      primarySignerCount: primary.signerIds.length,
      delayedKeyLabel: null,
      summary: `${primary.threshold} of ${primary.signerIds.length} primary signers + delayed paths`
    };
  }
  if (template?.type !== 'recovery') {
    return {
      delayed: false,
      primaryThreshold: wallet.threshold,
      primarySignerCount: wallet.cosigners.length,
      delayedKeyLabel: null,
      summary: `${wallet.threshold} of ${wallet.cosigners.length}`
    };
  }
  const knownIds = new Set(wallet.cosigners.map((signer) => signer.id));
  const immediateIds = [...new Set(template.immediate.signerIds)];
  const delayedIds = [...new Set(template.recovery.signerIds)];
  const valid =
    immediateIds.length === template.immediate.signerIds.length &&
    delayedIds.length === template.recovery.signerIds.length &&
    immediateIds.every((id) => knownIds.has(id)) &&
    delayedIds.every((id) => knownIds.has(id)) &&
    immediateIds.every((id) => !delayedIds.includes(id)) &&
    template.immediate.threshold > 0 &&
    template.immediate.threshold <= immediateIds.length &&
    template.recovery.threshold === 1 &&
    delayedIds.length === 1;
  if (!valid) {
    return {
      delayed: true,
      primaryThreshold: 0,
      primarySignerCount: 0,
      delayedKeyLabel: null,
      summary: 'Policy details unavailable'
    };
  }
  const delayedKeyLabel = wallet.policyType === 'inheritance' ? 'Heir key' : 'Recovery key';
  return {
    delayed: true,
    primaryThreshold: template.immediate.threshold,
    primarySignerCount: immediateIds.length,
    delayedKeyLabel,
    summary: `${template.immediate.threshold} of ${immediateIds.length} primary keys + ${delayedKeyLabel.toLowerCase()} later`
  };
}

export function addressPrefixForNetwork(network: SupportedNetwork): 'bc1' | 'bcrt1' | 'tb1' {
  if (network === 'mainnet') return 'bc1';
  return network === 'regtest' ? 'bcrt1' : 'tb1';
}

export function hasAddressPrefixForNetwork(address: string, network: SupportedNetwork): boolean {
  const normalized = address.trim().toLowerCase();
  if (network === 'mainnet') {
    return (
      (normalized.startsWith('bc1') && normalized.length > 11) ||
      (/^[13]/.test(address.trim()) && normalized.length >= 26)
    );
  }
  if (network === 'regtest') {
    return (
      (normalized.startsWith('bcrt1') && normalized.length > 13) ||
      (/^[mn2]/.test(address.trim()) && normalized.length >= 26)
    );
  }
  return (
    (normalized.startsWith('tb1') && normalized.length > 11) ||
    (/^[mn2]/.test(address.trim()) && normalized.length >= 26)
  );
}

export function normalizePermanentLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('A permanent address label is required.');
  if (Array.from(normalized).length > 48)
    throw new Error('Address labels cannot exceed 48 characters.');
  return normalized;
}

export function canDiscardAddress(
  address: ReceiveAddress,
  hasObservedTransaction: boolean
): boolean {
  return address.status === 'awaiting' && !hasObservedTransaction;
}

export function awaitingPaymentAddresses(addresses: ReceiveAddress[]): ReceiveAddress[] {
  return addresses.filter((address) => address.status === 'awaiting');
}

export function recoveryWordCountIsValid(words: string): boolean {
  return words.trim().split(/\s+/).filter(Boolean).length === 24;
}

export function normalizeCoinSelection(selection?: CoinSelection): CoinSelection {
  if (!selection) return { mode: 'auto', strategy: 'balanced' };
  if (selection.mode === 'auto')
    return { mode: 'auto', strategy: selection.strategy ?? 'balanced' };
  const outpoints = [...new Set(selection.outpoints.map((item) => item.trim()).filter(Boolean))];
  if (outpoints.length === 0) throw new Error('Select at least one available coin.');
  return { mode: 'manual', outpoints };
}

export function selectedCoinTotal(
  coins: Pick<Utxo, 'outpoint' | 'amount' | 'frozen'>[],
  outpoints: string[]
): number {
  const selected = new Set(outpoints);
  return coins.reduce(
    (total, coin) => total + (selected.has(coin.outpoint) && !coin.frozen ? coin.amount : 0),
    0
  );
}

export type AddressReuseInsight = {
  address: string;
  outpoints: string[];
  labels: string[];
  totalAmount: number;
};

export function addressReuseInsights(
  coins: Pick<Utxo, 'outpoint' | 'amount' | 'address' | 'label'>[]
): AddressReuseInsight[] {
  const groups = new Map<string, AddressReuseInsight>();

  for (const coin of coins) {
    const address = coin.address.trim();
    if (!address || address.toLowerCase() === 'unknown') continue;

    const existing = groups.get(address);
    if (existing) {
      existing.outpoints.push(coin.outpoint);
      existing.totalAmount += coin.amount;
      if (coin.label && !existing.labels.includes(coin.label)) existing.labels.push(coin.label);
      continue;
    }

    groups.set(address, {
      address,
      outpoints: [coin.outpoint],
      labels: coin.label ? [coin.label] : [],
      totalAmount: coin.amount
    });
  }

  return [...groups.values()].filter((group) => group.outpoints.length > 1);
}

export type PolicyMaturitySummary = {
  policyType: NonNullable<Utxo['policyMaturity']>['policyType'];
  total: number;
  unconfirmed: number;
  immature: number;
  approaching: number;
  mature: number;
  nextRemainingBlocks: number | null;
  chainCurrent: boolean;
};

export function validPolicyMaturity(coin: Utxo): NonNullable<Utxo['policyMaturity']> | null {
  const value = coin.policyMaturity;
  if (!value) return null;
  const integers = [
    value.delayBlocks,
    value.ageBlocks,
    value.approachingAtBlocks,
    value.maturityHeight ?? 0,
    value.remainingBlocks ?? 0,
    value.approximateSecondsRemaining ?? 0
  ];
  if (
    !integers.every((item) => Number.isSafeInteger(item) && item >= 0) ||
    typeof value.delayedSpendSupported !== 'boolean' ||
    !(
      ['recovery', 'inheritance', 'partner_continuity_v1', 'family_continuity_v1'] as string[]
    ).includes(value.policyType) ||
    value.approachingAtBlocks > value.delayBlocks ||
    (value.state === 'unconfirmed' && value.remainingBlocks !== null) ||
    (value.state === 'mature' && value.remainingBlocks !== 0) ||
    !(['unconfirmed', 'immature', 'approaching', 'mature'] as string[]).includes(value.state)
  )
    return null;
  return value;
}

export function policyMaturitySummary(
  coins: Utxo[],
  chainTip: WalletSnapshot['chainTip']
): PolicyMaturitySummary | null {
  const maturities = coins.map(validPolicyMaturity).filter((value) => value !== null);
  if (!maturities.length) return null;
  const policyType = maturities[0].policyType;
  if (maturities.some((value) => value.policyType !== policyType)) return null;
  const remaining = maturities
    .map((value) => value.remainingBlocks)
    .filter((value): value is number => value !== null && value > 0);
  return {
    policyType,
    total: maturities.length,
    unconfirmed: maturities.filter((value) => value.state === 'unconfirmed').length,
    immature: maturities.filter((value) => value.state === 'immature').length,
    approaching: maturities.filter((value) => value.state === 'approaching').length,
    mature: maturities.filter((value) => value.state === 'mature').length,
    nextRemainingBlocks: remaining.length ? Math.min(...remaining) : null,
    chainCurrent: chainTip.status === 'recent'
  };
}

export function approximateBlockDuration(seconds: number | null): {
  value: number;
  unit: 'days' | 'months' | 'years';
} | null {
  if (!Number.isSafeInteger(seconds) || seconds === null || seconds < 0) return null;
  const days = Math.ceil(seconds / 86_400);
  if (days < 60) return { value: days, unit: 'days' };
  const months = Math.ceil(days / 30.4375);
  if (months < 24) return { value: months, unit: 'months' };
  return { value: Math.ceil(months / 12), unit: 'years' };
}
