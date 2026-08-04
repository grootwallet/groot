use std::time::Duration;

const FREE_FAILURES: u32 = 4;
const MAX_DELAY_SECS: u64 = 60;

#[derive(Debug, Default)]
pub struct AuthThrottle {
    failures: u32,
    retry_at: u64,
}

impl AuthThrottle {
    pub fn check(&self, now: u64) -> Result<(), Duration> {
        if now < self.retry_at {
            Err(Duration::from_secs(self.retry_at - now))
        } else {
            Ok(())
        }
    }

    pub fn failed(&mut self, now: u64) -> Duration {
        self.failures = self.failures.saturating_add(1);
        let delay = if self.failures <= FREE_FAILURES {
            0
        } else {
            1_u64
                .checked_shl(self.failures.saturating_sub(FREE_FAILURES + 1).min(6))
                .unwrap_or(MAX_DELAY_SECS)
                .min(MAX_DELAY_SECS)
        };
        self.retry_at = now.saturating_add(delay);
        Duration::from_secs(delay)
    }

    pub fn succeeded(&mut self) {
        self.failures = 0;
        self.retry_at = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delays_repeated_failures_and_resets_after_success() {
        let mut throttle = AuthThrottle::default();
        for _ in 0..FREE_FAILURES {
            assert_eq!(throttle.failed(100), Duration::ZERO);
            assert!(throttle.check(100).is_ok());
        }
        assert_eq!(throttle.failed(100), Duration::from_secs(1));
        assert_eq!(throttle.check(100), Err(Duration::from_secs(1)));
        assert!(throttle.check(101).is_ok());
        assert_eq!(throttle.failed(101), Duration::from_secs(2));
        throttle.succeeded();
        assert!(throttle.check(101).is_ok());
        assert_eq!(throttle.failed(101), Duration::ZERO);
    }

    #[test]
    fn delay_is_bounded_and_time_math_saturates() {
        let mut throttle = AuthThrottle::default();
        for _ in 0..100 {
            throttle.failed(u64::MAX - 10);
        }
        assert_eq!(throttle.retry_at, u64::MAX);
        assert_eq!(throttle.check(u64::MAX - 1), Err(Duration::from_secs(1)));
        assert!(throttle.check(u64::MAX).is_ok());
        assert_eq!(throttle.failed(0), Duration::from_secs(MAX_DELAY_SECS));
    }
}
