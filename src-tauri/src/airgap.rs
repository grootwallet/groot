use std::collections::BTreeMap;
pub const MAX_AIRGAP_BYTES: usize = 256 * 1024;
pub const MAX_PARTS: usize = 512;
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AirgapError {
    Empty,
    TooLarge,
    InvalidPart,
    TooManyParts,
    MismatchedSet,
    DuplicateConflict,
    Incomplete,
}
#[derive(Default)]
pub struct MultipartDecoder {
    total: Option<usize>,
    tag: Option<String>,
    parts: BTreeMap<usize, Vec<u8>>,
    bytes: usize,
}
impl MultipartDecoder {
    pub fn ingest(
        &mut self,
        tag: &str,
        index: usize,
        total: usize,
        payload: &[u8],
    ) -> Result<bool, AirgapError> {
        if payload.is_empty() {
            return Err(AirgapError::Empty);
        }
        if total == 0 || index >= total {
            return Err(AirgapError::InvalidPart);
        }
        if total > MAX_PARTS {
            return Err(AirgapError::TooManyParts);
        }
        if self.total.is_some_and(|v| v != total) || self.tag.as_deref().is_some_and(|v| v != tag) {
            return Err(AirgapError::MismatchedSet);
        }
        if let Some(old) = self.parts.get(&index) {
            return if old == payload {
                Ok(self.parts.len() == total)
            } else {
                Err(AirgapError::DuplicateConflict)
            };
        }
        if self.bytes.saturating_add(payload.len()) > MAX_AIRGAP_BYTES {
            return Err(AirgapError::TooLarge);
        }
        self.total = Some(total);
        self.tag = Some(tag.into());
        self.bytes += payload.len();
        self.parts.insert(index, payload.to_vec());
        Ok(self.parts.len() == total)
    }
    pub fn finish(self) -> Result<Vec<u8>, AirgapError> {
        let total = self.total.ok_or(AirgapError::Incomplete)?;
        if self.parts.len() != total {
            return Err(AirgapError::Incomplete);
        }
        let mut out = Vec::with_capacity(self.bytes);
        for i in 0..total {
            out.extend(self.parts.get(&i).ok_or(AirgapError::Incomplete)?)
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_out_of_order_and_idempotent_duplicates() {
        let mut d = MultipartDecoder::default();
        assert!(!d.ingest("x", 1, 2, b"b").unwrap());
        assert!(!d.ingest("x", 1, 2, b"b").unwrap());
        assert!(d.ingest("x", 0, 2, b"a").unwrap());
        assert_eq!(d.finish().unwrap(), b"ab");
    }
    #[test]
    fn rejects_hostile_frames() {
        let mut d = MultipartDecoder::default();
        assert_eq!(d.ingest("x", 0, 0, b"a"), Err(AirgapError::InvalidPart));
        assert_eq!(
            d.ingest("x", 0, MAX_PARTS + 1, b"a"),
            Err(AirgapError::TooManyParts)
        );
        assert_eq!(d.ingest("x", 0, 1, b""), Err(AirgapError::Empty));
        d.ingest("x", 0, 2, b"a").unwrap();
        assert_eq!(d.ingest("y", 1, 2, b"b"), Err(AirgapError::MismatchedSet));
        assert_eq!(
            d.ingest("x", 0, 2, b"z"),
            Err(AirgapError::DuplicateConflict)
        );
        assert_eq!(d.finish(), Err(AirgapError::Incomplete));
        let mut d = MultipartDecoder::default();
        assert_eq!(
            d.ingest("x", 0, 1, &vec![0; MAX_AIRGAP_BYTES + 1]),
            Err(AirgapError::TooLarge)
        );
    }
}
