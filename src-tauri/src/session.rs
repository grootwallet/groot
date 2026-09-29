use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use uuid::Uuid;

/// Process-local unlock lifetimes, keyed by wallet identity.
///
/// Durable authentication throttling remains in the wallet database. This type
/// owns only the monotonic inactivity deadline for already-authenticated wallet
/// sessions and deliberately has no persistence or Tauri dependencies.
#[derive(Default)]
pub(crate) struct WalletSessions {
    last_activity: HashMap<Uuid, Instant>,
    identities: HashMap<Uuid, Uuid>,
    active_user_operations: HashMap<Uuid, usize>,
}

impl WalletSessions {
    pub(crate) fn unlock(&mut self, wallet_id: Uuid) {
        self.active_user_operations.remove(&wallet_id);
        self.last_activity.insert(wallet_id, Instant::now());
        self.identities.insert(wallet_id, Uuid::new_v4());
    }

    pub(crate) fn identity(&self, wallet_id: Uuid) -> Option<Uuid> {
        self.identities.get(&wallet_id).copied()
    }

    pub(crate) fn authorize_at(
        &mut self,
        wallet_id: Uuid,
        record_activity: bool,
        now: Instant,
        idle_timeout: Duration,
    ) -> bool {
        let Some(last_activity) = self.last_activity.get_mut(&wallet_id) else {
            return false;
        };
        let operation_active = self
            .active_user_operations
            .get(&wallet_id)
            .is_some_and(|count| *count > 0);
        if !operation_active && now.duration_since(*last_activity) > idle_timeout {
            self.last_activity.remove(&wallet_id);
            self.identities.remove(&wallet_id);
            self.active_user_operations.remove(&wallet_id);
            return false;
        }
        if record_activity {
            *last_activity = now;
        }
        true
    }

    pub(crate) fn prune_expired_at(&mut self, now: Instant, idle_timeout: Duration) -> Vec<Uuid> {
        let mut expired = Vec::new();
        self.last_activity.retain(|wallet_id, last_activity| {
            let operation_active = self
                .active_user_operations
                .get(wallet_id)
                .is_some_and(|count| *count > 0);
            let keep = operation_active || now.duration_since(*last_activity) <= idle_timeout;
            if !keep {
                expired.push(*wallet_id);
            }
            keep
        });
        for wallet_id in &expired {
            self.identities.remove(wallet_id);
            self.active_user_operations.remove(wallet_id);
        }
        expired
    }

    pub(crate) fn begin_user_operation(&mut self, wallet_id: Uuid) -> Option<Uuid> {
        let identity = self.identity(wallet_id)?;
        *self.active_user_operations.entry(wallet_id).or_default() += 1;
        Some(identity)
    }

    pub(crate) fn finish_user_operation(&mut self, wallet_id: Uuid, identity: Uuid, now: Instant) {
        let Some(active) = self.active_user_operations.get_mut(&wallet_id) else {
            return;
        };
        *active = active.saturating_sub(1);
        if *active == 0 {
            self.active_user_operations.remove(&wallet_id);
        }
        if self.identities.get(&wallet_id) == Some(&identity) {
            if let Some(last_activity) = self.last_activity.get_mut(&wallet_id) {
                *last_activity = now;
            }
        }
    }

    pub(crate) fn lock(&mut self, wallet_id: Uuid) {
        self.last_activity.remove(&wallet_id);
        self.identities.remove(&wallet_id);
        self.active_user_operations.remove(&wallet_id);
    }

    pub(crate) fn is_unlocked(&self, wallet_id: Uuid) -> bool {
        self.last_activity.contains_key(&wallet_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_are_independent_across_wallet_switches() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let idle_timeout = Duration::from_secs(5 * 60);
        let mut sessions = WalletSessions::default();

        sessions.unlock(first);
        sessions.unlock(second);
        let now = Instant::now();

        assert!(sessions.authorize_at(first, true, now, idle_timeout));
        assert!(sessions.authorize_at(second, true, now, idle_timeout));
        sessions.lock(second);
        assert!(sessions.authorize_at(first, false, now, idle_timeout));
        assert!(!sessions.authorize_at(second, false, now, idle_timeout));
    }

    #[test]
    fn unlocked_membership_tracks_each_wallet_session() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let mut sessions = WalletSessions::default();

        sessions.unlock(first);
        assert!(sessions.is_unlocked(first));
        assert!(!sessions.is_unlocked(second));

        sessions.unlock(second);
        sessions.lock(first);
        assert!(!sessions.is_unlocked(first));
        assert!(sessions.is_unlocked(second));
    }

    #[test]
    fn background_sync_does_not_extend_the_idle_deadline() {
        let wallet_id = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(wallet_id, started);

        assert!(sessions.authorize_at(
            wallet_id,
            false,
            started + idle_timeout - Duration::from_secs(1),
            idle_timeout
        ));
        assert!(!sessions.authorize_at(
            wallet_id,
            false,
            started + idle_timeout + Duration::from_secs(1),
            idle_timeout
        ));
    }

    #[test]
    fn user_activity_refreshes_only_the_active_wallet_deadline() {
        let active = Uuid::new_v4();
        let inactive = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let refreshed = started + idle_timeout - Duration::from_secs(1);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(active, started);
        sessions.last_activity.insert(inactive, started);

        assert!(sessions.authorize_at(active, true, refreshed, idle_timeout));
        assert!(sessions.authorize_at(
            active,
            false,
            refreshed + Duration::from_secs(2),
            idle_timeout
        ));
        assert!(!sessions.authorize_at(
            inactive,
            false,
            refreshed + Duration::from_secs(2),
            idle_timeout
        ));
    }

    #[test]
    fn background_heartbeat_prunes_every_expired_wallet_session() {
        let selected = Uuid::new_v4();
        let inactive = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(5 * 60);
        let now = started + idle_timeout + Duration::from_secs(1);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(selected, now);
        sessions.last_activity.insert(inactive, started);

        assert_eq!(sessions.prune_expired_at(now, idle_timeout), vec![inactive]);
        assert!(sessions.authorize_at(selected, false, now, idle_timeout));
        assert!(!sessions.authorize_at(inactive, false, now, idle_timeout));
    }

    #[test]
    fn sessions_honor_the_configured_global_timeout() {
        let wallet_id = Uuid::new_v4();
        let started = Instant::now();
        let one_minute = Duration::from_secs(60);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(wallet_id, started);

        assert!(sessions.authorize_at(
            wallet_id,
            false,
            started + Duration::from_secs(59),
            one_minute
        ));
        assert!(!sessions.authorize_at(
            wallet_id,
            false,
            started + Duration::from_secs(61),
            one_minute
        ));
    }

    #[test]
    fn active_user_operation_suspends_idle_expiry_and_refreshes_on_completion() {
        let wallet_id = Uuid::new_v4();
        let identity = Uuid::new_v4();
        let started = Instant::now();
        let idle_timeout = Duration::from_secs(60);
        let finished = started + Duration::from_secs(90);
        let mut sessions = WalletSessions::default();
        sessions.last_activity.insert(wallet_id, started);
        sessions.identities.insert(wallet_id, identity);

        assert_eq!(sessions.begin_user_operation(wallet_id), Some(identity));
        assert!(sessions.authorize_at(wallet_id, false, finished, idle_timeout));
        assert!(sessions.prune_expired_at(finished, idle_timeout).is_empty());

        sessions.finish_user_operation(wallet_id, identity, finished);
        assert!(sessions.authorize_at(
            wallet_id,
            false,
            finished + Duration::from_secs(59),
            idle_timeout
        ));
        assert!(!sessions.authorize_at(
            wallet_id,
            false,
            finished + Duration::from_secs(61),
            idle_timeout
        ));
    }

    #[test]
    fn explicit_lock_invalidates_an_active_user_operation() {
        let wallet_id = Uuid::new_v4();
        let mut sessions = WalletSessions::default();
        sessions.unlock(wallet_id);
        let identity = sessions.begin_user_operation(wallet_id).unwrap();

        sessions.lock(wallet_id);
        sessions.finish_user_operation(wallet_id, identity, Instant::now());

        assert!(!sessions.is_unlocked(wallet_id));
        assert!(!sessions.active_user_operations.contains_key(&wallet_id));
    }
}
