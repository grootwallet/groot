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
}

impl WalletSessions {
    pub(crate) fn unlock(&mut self, wallet_id: Uuid) {
        self.last_activity.insert(wallet_id, Instant::now());
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
        if now.duration_since(*last_activity) > idle_timeout {
            self.last_activity.remove(&wallet_id);
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
            let keep = now.duration_since(*last_activity) <= idle_timeout;
            if !keep {
                expired.push(*wallet_id);
            }
            keep
        });
        expired
    }

    pub(crate) fn lock(&mut self, wallet_id: Uuid) {
        self.last_activity.remove(&wallet_id);
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
}
