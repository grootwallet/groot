import type { MultisigProposal } from './contracts';

export function latestActiveProposal(proposals: MultisigProposal[]): MultisigProposal | null {
  return proposals
    .filter((proposal) => proposal.status === 'collecting' || proposal.status === 'ready')
    .toSorted((left, right) => {
      const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      return Number.isNaN(createdDifference) || createdDifference === 0
        ? right.proposalId.localeCompare(left.proposalId)
        : createdDifference;
    })[0] ?? null;
}
