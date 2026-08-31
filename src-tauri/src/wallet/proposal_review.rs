use super::*;

pub(super) fn require_reviewed_psbt_unchanged(
    current: &str,
    reviewed: &str,
    mismatch_message: &'static str,
) -> ApiResult<()> {
    if current != reviewed {
        return Err(api_error("proposal_mismatch", mismatch_message));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewed_psbt_binding_accepts_only_the_exact_reviewed_bytes() {
        assert!(require_reviewed_psbt_unchanged("psbt", "psbt", "mismatch").is_ok());
        let error = require_reviewed_psbt_unchanged("changed", "reviewed", "mismatch").unwrap_err();
        assert_eq!(error.code, "proposal_mismatch");
        assert_eq!(error.message, "mismatch");
    }
}
