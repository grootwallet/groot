//! Offline previous-output authentication. This proves committed values and
//! scripts, not confirmation, chain membership or current spendability.
use bdk_wallet::bitcoin::Psbt;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrevoutError {
    pub code: &'static str,
    pub message: &'static str,
}
impl PrevoutError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }
}

/// Verify every full previous transaction and witness output without mutation.
pub fn authenticate_prevouts(psbt: &Psbt) -> Result<(), PrevoutError> {
    if psbt.inputs.is_empty() || psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(PrevoutError::new(
            "malformed_psbt",
            "The PSBT has no signable inputs.",
        ));
    }
    let mut seen = HashSet::new();
    for (txin, input) in psbt.unsigned_tx.input.iter().zip(&psbt.inputs) {
        if !seen.insert(txin.previous_output) {
            return Err(PrevoutError::new(
                "proposal_mismatch",
                "The PSBT repeats an input.",
            ));
        }
        let previous = input.non_witness_utxo.as_ref().ok_or_else(|| PrevoutError::new(
            "malformed_psbt", "Mobile signing requires the complete previous transaction for every input. Export the full PSBT from the coordinator."
        ))?;
        if previous.compute_txid() != txin.previous_output.txid {
            return Err(PrevoutError::new(
                "proposal_mismatch",
                "A PSBT input does not match its previous transaction.",
            ));
        }
        let output = previous
            .output
            .get(txin.previous_output.vout as usize)
            .ok_or_else(|| {
                PrevoutError::new(
                    "proposal_mismatch",
                    "A PSBT input points outside its previous transaction.",
                )
            })?;
        let witness = input.witness_utxo.as_ref().ok_or_else(|| {
            PrevoutError::new(
                "malformed_psbt",
                "Every mobile-signing input must include its witness UTXO.",
            )
        })?;
        if output != witness {
            return Err(PrevoutError::new(
                "proposal_mismatch",
                "A PSBT input does not match its authenticated previous output.",
            ));
        }
    }
    Ok(())
}
