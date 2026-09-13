import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tauriAdapter = readFileSync(new URL('./tauri.ts', import.meta.url), 'utf8');
const transactionCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/transaction_commands.rs', import.meta.url),
  'utf8'
);
const multisigCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_proposal_commands.rs', import.meta.url),
  'utf8'
);

describe('normal payment fee-rate precision', () => {
  it('sends exact decimal text across every native payment boundary', () => {
    expect(tauriAdapter.match(/feeRate: String\(feeRate\)/g)?.length).toBeGreaterThanOrEqual(8);
    expect(transactionCommands).toMatch(
      /pub async fn tx_prepare\([\s\S]*?fee_rate: String,[\s\S]*?validate_fee_rate\(&fee_rate\)/
    );
    expect(transactionCommands).toMatch(
      /pub async fn tx_max_spend\([\s\S]*?fee_rate: String,[\s\S]*?validate_fee_rate\(&fee_rate\)/
    );
    for (const command of [
      'multisig_tx_prepare',
      'multisig_policy_renewal_prepare',
      'multisig_delayed_spend_prepare',
      'multisig_tx_max_spend'
    ]) {
      const start = multisigCommands.indexOf(`pub fn ${command}`);
      const end = multisigCommands.indexOf('#[tauri::command]', start + 1);
      const source = multisigCommands.slice(start, end === -1 ? undefined : end);
      expect(source).toContain('fee_rate: String');
      expect(source).toContain('validate_fee_rate(&fee_rate)');
    }
  });

  it('uses sat/kwu precision instead of rounding normal sends to whole sat/vB', () => {
    expect(transactionCommands).toContain('FeeRate::from_sat_per_kwu(sat_per_kwu)');
    expect(transactionCommands).not.toContain('let applied_fee_rate = fee_rate.ceil()');
    expect(multisigCommands).not.toContain('fee_rate.ceil()');
  });
});
