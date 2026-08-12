use bdk_wallet::{
    bitcoin::{Amount, FeeRate, Script, TxIn, Weight},
    coin_selection::{
        decide_change, CoinSelectionAlgorithm, CoinSelectionResult, InsufficientFunds,
    },
    WeightedUtxo,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomaticSelectionStrategy {
    #[default]
    Balanced,
    Private,
    LowerFee,
}

impl AutomaticSelectionStrategy {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Balanced => "balanced",
            Self::Private => "private",
            Self::LowerFee => "lower_fee",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CoinPrivacy {
    pub label_ids: BTreeSet<String>,
    pub cluster_ids: BTreeSet<String>,
    pub unknown: bool,
    pub address_reused: bool,
}

#[derive(Debug, Clone)]
pub struct PrivacyAwareCoinSelection {
    strategy: AutomaticSelectionStrategy,
    privacy: HashMap<String, CoinPrivacy>,
}

impl PrivacyAwareCoinSelection {
    pub fn new(
        strategy: AutomaticSelectionStrategy,
        privacy: HashMap<String, CoinPrivacy>,
    ) -> Self {
        Self { strategy, privacy }
    }

    fn metadata(&self, utxo: &WeightedUtxo) -> CoinPrivacy {
        self.privacy
            .get(&utxo.utxo.outpoint().to_string())
            .cloned()
            .unwrap_or_else(|| CoinPrivacy {
                unknown: true,
                ..CoinPrivacy::default()
            })
    }

    fn choose_next<R: RngCore>(
        &self,
        optional: &[WeightedUtxo],
        selected_labels: &BTreeSet<String>,
        selected_clusters: &BTreeSet<String>,
        needed: Amount,
        rand: &mut R,
    ) -> usize {
        optional
            .iter()
            .enumerate()
            .map(|(index, candidate)| {
                let privacy = self.metadata(candidate);
                let new_labels = privacy.label_ids.difference(selected_labels).count();
                let new_clusters = privacy.cluster_ids.difference(selected_clusters).count();
                let value = candidate.utxo.txout().value.to_sat();
                let enough = candidate.utxo.txout().value >= needed;
                let excess = if enough {
                    value - needed.to_sat()
                } else {
                    u64::MAX - value
                };
                let tie = rand.next_u64();
                let score = match self.strategy {
                    AutomaticSelectionStrategy::LowerFee => (0, 0, 0, 0, u64::MAX - value, tie),
                    AutomaticSelectionStrategy::Private => (
                        usize::from(privacy.address_reused),
                        usize::from(privacy.unknown),
                        new_clusters,
                        new_labels,
                        excess,
                        tie,
                    ),
                    AutomaticSelectionStrategy::Balanced => (
                        usize::from(privacy.address_reused),
                        usize::from(privacy.unknown),
                        usize::from(!enough),
                        new_clusters.saturating_add(new_labels),
                        excess,
                        tie,
                    ),
                };
                (score, index)
            })
            .min_by_key(|(score, _)| *score)
            .map(|(_, index)| index)
            .expect("coin selection only ranks a non-empty candidate set")
    }

    fn preferred_funding_group(
        &self,
        optional: &[WeightedUtxo],
        fee_rate: FeeRate,
        target_amount: Amount,
    ) -> Option<String> {
        if matches!(self.strategy, AutomaticSelectionStrategy::LowerFee) {
            return None;
        }
        let mut groups: HashMap<String, (Amount, Weight, BTreeSet<String>, bool, bool)> =
            HashMap::new();
        for candidate in optional {
            let privacy = self.metadata(candidate);
            for cluster in &privacy.cluster_ids {
                let group = groups.entry(cluster.clone()).or_insert((
                    Amount::ZERO,
                    Weight::ZERO,
                    BTreeSet::new(),
                    false,
                    false,
                ));
                group.0 += candidate.utxo.txout().value;
                group.1 += TxIn::default()
                    .segwit_weight()
                    .checked_add(candidate.satisfaction_weight)
                    .expect("input weight addition cannot overflow");
                group.2.extend(privacy.label_ids.iter().cloned());
                group.3 |= privacy.unknown;
                group.4 |= privacy.address_reused;
            }
        }
        groups
            .into_iter()
            .filter(|(_, (amount, weight, _, _, _))| *amount >= target_amount + fee_rate * *weight)
            .min_by_key(|(cluster, (amount, _, labels, unknown, reused))| {
                (
                    usize::from(*reused),
                    usize::from(*unknown),
                    labels.len(),
                    amount.to_sat(),
                    cluster.clone(),
                )
            })
            .map(|(cluster, _)| cluster)
    }
}

impl CoinSelectionAlgorithm for PrivacyAwareCoinSelection {
    fn coin_select<R: RngCore>(
        &self,
        required_utxos: Vec<WeightedUtxo>,
        mut optional_utxos: Vec<WeightedUtxo>,
        fee_rate: FeeRate,
        target_amount: Amount,
        drain_script: &Script,
        rand: &mut R,
    ) -> Result<CoinSelectionResult, InsufficientFunds> {
        if required_utxos.is_empty() {
            if let Some(group) =
                self.preferred_funding_group(&optional_utxos, fee_rate, target_amount)
            {
                optional_utxos
                    .retain(|candidate| self.metadata(candidate).cluster_ids.contains(&group));
            }
        }
        let mut selected = Vec::new();
        let mut selected_amount = Amount::ZERO;
        let mut total_weight = Weight::ZERO;
        let mut labels = BTreeSet::new();
        let mut clusters = BTreeSet::new();

        for weighted in required_utxos {
            let privacy = self.metadata(&weighted);
            labels.extend(privacy.label_ids);
            clusters.extend(privacy.cluster_ids);
            total_weight += TxIn::default()
                .segwit_weight()
                .checked_add(weighted.satisfaction_weight)
                .expect("input weight addition cannot overflow");
            selected_amount += weighted.utxo.txout().value;
            selected.push(weighted.utxo);
        }

        while selected_amount < target_amount + fee_rate * total_weight {
            if optional_utxos.is_empty() {
                return Err(InsufficientFunds {
                    needed: target_amount + fee_rate * total_weight,
                    available: selected_amount,
                });
            }
            let needed = target_amount + fee_rate * total_weight - selected_amount;
            let index = self.choose_next(&optional_utxos, &labels, &clusters, needed, rand);
            let weighted = optional_utxos.swap_remove(index);
            let privacy = self.metadata(&weighted);
            labels.extend(privacy.label_ids);
            clusters.extend(privacy.cluster_ids);
            total_weight += TxIn::default()
                .segwit_weight()
                .checked_add(weighted.satisfaction_weight)
                .expect("input weight addition cannot overflow");
            selected_amount += weighted.utxo.txout().value;
            selected.push(weighted.utxo);
        }

        let fee_amount = fee_rate * total_weight;
        let amount_needed = target_amount + fee_amount;
        if selected_amount < amount_needed {
            return Err(InsufficientFunds {
                needed: amount_needed,
                available: selected_amount,
            });
        }
        Ok(CoinSelectionResult {
            selected,
            fee_amount,
            excess: decide_change(selected_amount - amount_needed, fee_rate, drain_script),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::{
        bitcoin::{
            absolute::LockTime, transaction::Version, OutPoint, ScriptBuf, Transaction, TxOut,
        },
        chain::ChainPosition,
        LocalOutput, Utxo,
    };
    use rand::{rngs::StdRng, SeedableRng};

    fn weighted(value: u64, vout: u32) -> WeightedUtxo {
        let tx = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![],
            output: vec![],
        };
        WeightedUtxo {
            satisfaction_weight: Weight::from_wu(68),
            utxo: Utxo::Local(LocalOutput {
                outpoint: OutPoint {
                    txid: tx.compute_txid(),
                    vout,
                },
                txout: TxOut {
                    value: Amount::from_sat(value),
                    script_pubkey: ScriptBuf::new(),
                },
                keychain: bdk_wallet::KeychainKind::External,
                is_spent: false,
                derivation_index: vout,
                chain_position: ChainPosition::Unconfirmed {
                    first_seen: Some(1),
                    last_seen: Some(1),
                },
            }),
        }
    }

    #[test]
    fn private_strategy_avoids_reused_and_unknown_coins() {
        let safe = weighted(20_000, 0);
        let reused = weighted(30_000, 1);
        let mut privacy = HashMap::new();
        privacy.insert(
            safe.utxo.outpoint().to_string(),
            CoinPrivacy {
                label_ids: BTreeSet::from(["safe".into()]),
                cluster_ids: BTreeSet::from(["a".into()]),
                unknown: false,
                address_reused: false,
            },
        );
        privacy.insert(
            reused.utxo.outpoint().to_string(),
            CoinPrivacy {
                label_ids: BTreeSet::from(["reused".into()]),
                cluster_ids: BTreeSet::from(["b".into()]),
                unknown: false,
                address_reused: true,
            },
        );
        let selector = PrivacyAwareCoinSelection::new(AutomaticSelectionStrategy::Private, privacy);
        let mut rng = StdRng::seed_from_u64(7);
        let result = selector
            .coin_select(
                vec![],
                vec![reused, safe],
                FeeRate::ZERO,
                Amount::from_sat(10_000),
                Script::new(),
                &mut rng,
            )
            .unwrap();
        assert_eq!(result.selected[0].outpoint().vout, 0);
    }

    #[test]
    fn lower_fee_strategy_prefers_the_largest_coin() {
        let selector =
            PrivacyAwareCoinSelection::new(AutomaticSelectionStrategy::LowerFee, HashMap::new());
        let mut rng = StdRng::seed_from_u64(7);
        let result = selector
            .coin_select(
                vec![],
                vec![weighted(20_000, 0), weighted(30_000, 1)],
                FeeRate::ZERO,
                Amount::from_sat(10_000),
                Script::new(),
                &mut rng,
            )
            .unwrap();
        assert_eq!(result.selected[0].outpoint().vout, 1);
    }

    #[test]
    fn private_strategy_uses_one_funding_group_when_that_group_is_sufficient() {
        let first = weighted(6_000, 0);
        let second = weighted(6_000, 1);
        let unrelated = weighted(20_000, 2);
        let mut privacy = HashMap::new();
        for coin in [&first, &second] {
            privacy.insert(
                coin.utxo.outpoint().to_string(),
                CoinPrivacy {
                    label_ids: BTreeSet::from(["salary".into()]),
                    cluster_ids: BTreeSet::from(["salary-cluster".into()]),
                    ..CoinPrivacy::default()
                },
            );
        }
        privacy.insert(
            unrelated.utxo.outpoint().to_string(),
            CoinPrivacy {
                label_ids: BTreeSet::from(["gift".into()]),
                cluster_ids: BTreeSet::from(["gift-cluster".into()]),
                address_reused: true,
                ..CoinPrivacy::default()
            },
        );
        let selector = PrivacyAwareCoinSelection::new(AutomaticSelectionStrategy::Private, privacy);
        let mut rng = StdRng::seed_from_u64(9);
        let result = selector
            .coin_select(
                vec![],
                vec![unrelated, first, second],
                FeeRate::ZERO,
                Amount::from_sat(10_000),
                Script::new(),
                &mut rng,
            )
            .unwrap();
        assert_eq!(result.selected.len(), 2);
        assert!(result.selected.iter().all(|coin| coin.outpoint().vout < 2));
    }

    #[test]
    fn equivalent_candidates_have_reproducible_seeded_tie_breaking() {
        let select = || {
            let selector =
                PrivacyAwareCoinSelection::new(AutomaticSelectionStrategy::Private, HashMap::new());
            let mut rng = StdRng::seed_from_u64(42);
            selector
                .coin_select(
                    vec![],
                    vec![weighted(10_000, 0), weighted(10_000, 1)],
                    FeeRate::ZERO,
                    Amount::from_sat(5_000),
                    Script::new(),
                    &mut rng,
                )
                .unwrap()
                .selected[0]
                .outpoint()
        };
        assert_eq!(select(), select());
    }
}
