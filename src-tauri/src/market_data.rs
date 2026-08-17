use serde::{Deserialize, Serialize};

const API_ORIGIN: &str = "https://sats-signal.vercel.app";
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_STATUS_BYTES: usize = 8 * 1024;
const MAX_TICKER_BYTES: usize = 64 * 1024;
const MAX_STATS_BYTES: usize = 128 * 1024;
const MAX_HISTORY_BYTES: usize = 512 * 1024;
const REQUEST_TIMEOUT_SECONDS: u64 = 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarketDataError {
    code: &'static str,
    message: &'static str,
}

type MarketResult<T> = Result<T, MarketDataError>;

fn unavailable() -> MarketDataError {
    MarketDataError {
        code: "market_data_unavailable",
        message: "Market data is temporarily unavailable.",
    }
}

fn parse_currency(value: &str) -> MarketResult<&'static str> {
    match value {
        "USD" => Ok("USD"),
        "EUR" => Ok("EUR"),
        "GBP" => Ok("GBP"),
        _ => Err(MarketDataError {
            code: "invalid_market_currency",
            message: "Choose USD, EUR, or GBP.",
        }),
    }
}

fn parse_range(value: &str) -> MarketResult<&'static str> {
    match value {
        "1D" => Ok("1D"),
        "1W" => Ok("1W"),
        "1M" => Ok("1M"),
        "6M" => Ok("6M"),
        "YTD" => Ok("YTD"),
        "1Y" => Ok("1Y"),
        "5Y" => Ok("5Y"),
        "ALL" => Ok("ALL"),
        _ => Err(MarketDataError {
            code: "invalid_market_range",
            message: "Choose a supported market range.",
        }),
    }
}

fn fetch_bounded(url: &str, max_body_bytes: usize) -> MarketResult<Vec<u8>> {
    let mut response = minreq::get(url)
        .with_timeout(REQUEST_TIMEOUT_SECONDS)
        .with_follow_redirects(false)
        .with_max_headers_size(MAX_HEADER_BYTES)
        .with_max_status_line_length(MAX_STATUS_BYTES)
        .with_header("Accept", "application/json")
        .with_header("User-Agent", "groot-wallet/0.1")
        .send_lazy()
        .map_err(|_| unavailable())?;
    if response.status_code != 200 {
        return Err(unavailable());
    }
    if response
        .headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|length| length > max_body_bytes)
    {
        return Err(unavailable());
    }
    let mut body = Vec::new();
    for next in &mut response {
        let (byte, remaining) = next.map_err(|_| unavailable())?;
        if body.len() >= max_body_bytes || remaining > max_body_bytes {
            return Err(unavailable());
        }
        body.push(byte);
    }
    Ok(body)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketTickerDto {
    base: String,
    quote: String,
    symbol: String,
    price: f64,
    time: String,
    source: String,
    updated_at: String,
}

fn validate_ticker(value: MarketTickerDto, expected: &str) -> MarketResult<MarketTickerDto> {
    if value.base != "BTC"
        || value.quote != expected
        || value.symbol != format!("BTC-{expected}")
        || !value.price.is_finite()
        || value.price <= 0.0
        || value.price > 1_000_000_000.0
        || value.time.is_empty()
        || value.time.len() > 64
        || value.updated_at.is_empty()
        || value.updated_at.len() > 64
        || value.source.is_empty()
        || value.source.len() > 96
    {
        return Err(unavailable());
    }
    Ok(value)
}

#[tauri::command]
pub fn market_ticker(currency: String) -> MarketResult<MarketTickerDto> {
    let currency = parse_currency(currency.trim())?;
    let url = format!("{API_ORIGIN}/api/ticker?currency={currency}");
    let value = serde_json::from_slice(&fetch_bounded(&url, MAX_TICKER_BYTES)?)
        .map_err(|_| unavailable())?;
    validate_ticker(value, currency)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketStatsDto {
    base: String,
    quote: String,
    symbol: String,
    price: f64,
    high24h: f64,
    low24h: f64,
    range24h: f64,
    range24h_percent: f64,
    change24h_percent: f64,
    volume24h_btc: f64,
    all_time_high: f64,
    all_time_high_time: String,
    from_all_time_high_percent: f64,
    sources: Vec<String>,
    updated_at: String,
}

fn validate_stats(value: MarketStatsDto, expected: &str) -> MarketResult<MarketStatsDto> {
    let bounded_number = |number: f64| number.is_finite() && number.abs() <= 1_000_000_000.0;
    if value.base != "BTC"
        || value.quote != expected
        || value.symbol != format!("BTC-{expected}")
        || !bounded_number(value.price)
        || !bounded_number(value.high24h)
        || !bounded_number(value.low24h)
        || !bounded_number(value.range24h)
        || !bounded_number(value.range24h_percent)
        || !bounded_number(value.change24h_percent)
        || !bounded_number(value.volume24h_btc)
        || !bounded_number(value.all_time_high)
        || !bounded_number(value.from_all_time_high_percent)
        || value.price <= 0.0
        || value.low24h <= 0.0
        || value.high24h < value.low24h
        || value.range24h < 0.0
        || value.volume24h_btc < 0.0
        || value.all_time_high < value.price
        || value.all_time_high_time.is_empty()
        || value.all_time_high_time.len() > 64
        || value.sources.is_empty()
        || value.sources.len() > 8
        || value
            .sources
            .iter()
            .any(|source| source.is_empty() || source.len() > 128)
        || value.updated_at.is_empty()
        || value.updated_at.len() > 64
    {
        return Err(unavailable());
    }
    Ok(value)
}

#[tauri::command]
pub fn market_stats(currency: String) -> MarketResult<MarketStatsDto> {
    let currency = parse_currency(currency.trim())?;
    let url = format!("{API_ORIGIN}/api/stats?currency={currency}");
    let value = serde_json::from_slice(&fetch_bounded(&url, MAX_STATS_BYTES)?)
        .map_err(|_| unavailable())?;
    validate_stats(value, currency)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MarketPointDto {
    time: i64,
    close: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketHistoryDto {
    base: String,
    quote: String,
    symbol: String,
    currency: String,
    range: String,
    points: Vec<MarketPointDto>,
    sources: Vec<String>,
    updated_at: String,
}

fn validate_history(
    mut value: MarketHistoryDto,
    expected_currency: &str,
    expected_range: &str,
) -> MarketResult<MarketHistoryDto> {
    if value.base != "BTC"
        || value.quote != expected_currency
        || value.currency != expected_currency
        || value.symbol != format!("BTC-{expected_currency}")
        || value.range != expected_range
        || value.points.len() < 2
        || value.points.len() > 512
        || value.sources.is_empty()
        || value.sources.len() > 8
        || value
            .sources
            .iter()
            .any(|source| source.is_empty() || source.len() > 128)
        || value.updated_at.is_empty()
        || value.updated_at.len() > 64
    {
        return Err(unavailable());
    }
    value.points.sort_by_key(|point| point.time);
    if value.points.iter().any(|point| {
        point.time <= 0
            || !point.close.is_finite()
            || point.close <= 0.0
            || point.close > 1_000_000_000.0
    }) || value
        .points
        .windows(2)
        .any(|pair| pair[0].time >= pair[1].time)
    {
        return Err(unavailable());
    }
    Ok(value)
}

#[tauri::command]
pub fn market_history(currency: String, range: String) -> MarketResult<MarketHistoryDto> {
    let currency = parse_currency(currency.trim())?;
    let range = parse_range(range.trim())?;
    let url =
        format!("{API_ORIGIN}/api/history?currency={currency}&range={range}&resolution=chart");
    let value = serde_json::from_slice(&fetch_bounded(&url, MAX_HISTORY_BYTES)?)
        .map_err(|_| unavailable())?;
    validate_history(value, currency, range)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_inputs_are_exact_allowlists() {
        assert_eq!(parse_currency("USD").unwrap(), "USD");
        assert_eq!(
            parse_currency("CAD").unwrap_err().code,
            "invalid_market_currency"
        );
        assert_eq!(parse_range("1M").unwrap(), "1M");
        assert_eq!(parse_range("2Y").unwrap_err().code, "invalid_market_range");
    }

    #[test]
    fn ticker_validation_rejects_wrong_market_and_invalid_prices() {
        let valid = MarketTickerDto {
            base: "BTC".into(),
            quote: "EUR".into(),
            symbol: "BTC-EUR".into(),
            price: 54_000.25,
            time: "2026-08-17T20:44:03Z".into(),
            source: "Coinbase".into(),
            updated_at: "2026-08-17T20:44:03Z".into(),
        };
        assert!(validate_ticker(valid.clone(), "EUR").is_ok());
        assert!(validate_ticker(
            MarketTickerDto {
                price: f64::NAN,
                ..valid
            },
            "EUR"
        )
        .is_err());
    }

    #[test]
    fn history_validation_sorts_points_and_rejects_duplicates() {
        let history = MarketHistoryDto {
            base: "BTC".into(),
            quote: "GBP".into(),
            symbol: "BTC-GBP".into(),
            currency: "GBP".into(),
            range: "1W".into(),
            points: vec![
                MarketPointDto {
                    time: 2,
                    close: 50_100.0,
                },
                MarketPointDto {
                    time: 1,
                    close: 50_000.0,
                },
            ],
            sources: vec!["Sats Signal".into()],
            updated_at: "2026-08-17T20:44:03Z".into(),
        };
        let sorted = validate_history(history.clone(), "GBP", "1W").unwrap();
        assert_eq!(sorted.points[0].time, 1);
        let duplicate = MarketHistoryDto {
            points: vec![
                MarketPointDto {
                    time: 1,
                    close: 50_000.0,
                },
                MarketPointDto {
                    time: 1,
                    close: 50_100.0,
                },
            ],
            ..history
        };
        assert!(validate_history(duplicate, "GBP", "1W").is_err());
    }

    #[test]
    fn market_stats_validation_rejects_incoherent_ranges() {
        let valid = MarketStatsDto {
            base: "BTC".into(),
            quote: "USD".into(),
            symbol: "BTC-USD".into(),
            price: 60_000.0,
            high24h: 61_000.0,
            low24h: 59_000.0,
            range24h: 2_000.0,
            range24h_percent: 3.39,
            change24h_percent: 1.2,
            volume24h_btc: 216.0,
            all_time_high: 120_000.0,
            all_time_high_time: "2025-10-06T00:00:00Z".into(),
            from_all_time_high_percent: -50.0,
            sources: vec!["Coinbase".into()],
            updated_at: "2026-08-17T20:44:03Z".into(),
        };
        assert!(validate_stats(valid.clone(), "USD").is_ok());
        assert!(validate_stats(
            MarketStatsDto {
                high24h: 58_000.0,
                ..valid
            },
            "USD"
        )
        .is_err());
    }
}
