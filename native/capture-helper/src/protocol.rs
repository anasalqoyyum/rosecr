use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

pub const MAX_HEADER: usize = 64 * 1024;
pub const MAX_PAYLOAD: usize = 128 * 1024 * 1024;
pub const MAX_DIMENSION: u32 = 32768;
pub const MAX_SAFE: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}
impl Rect {
    pub fn size(self) -> Result<(u32, u32), String> {
        let width = i64::from(self.right) - i64::from(self.left);
        let height = i64::from(self.bottom) - i64::from(self.top);
        if !(1..=i64::from(MAX_DIMENSION)).contains(&width)
            || !(1..=i64::from(MAX_DIMENSION)).contains(&height)
        {
            return Err("invalid physical client rectangle".into());
        }
        Ok((width as u32, height as u32))
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Region {
    pub fn validate(self) -> Result<(), String> {
        if ![self.x, self.y, self.width, self.height]
            .into_iter()
            .all(f64::is_finite)
            || self.x < 0.0
            || self.y < 0.0
            || self.width < 0.02
            || self.height < 0.02
            || self.x + self.width > 1.0 + 1e-9
            || self.y + self.height > 1.0 + 1e-9
        {
            return Err("invalid normalized region".into());
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    List,
    Query {
        target: String,
    },
    Start {
        target: String,
        #[serde(rename = "processId")]
        process_id: u32,
        #[serde(rename = "captureGeneration")]
        capture_generation: u64,
    },
    Grab {
        target: String,
        #[serde(rename = "captureGeneration")]
        capture_generation: u64,
        #[serde(rename = "sessionEpoch")]
        session_epoch: u64,
        region: Option<Region>,
    },
    Stop,
}
#[derive(Debug, Deserialize)]
pub struct Request {
    pub version: u8,
    #[serde(rename = "requestId")]
    pub request_id: u64,
    #[serde(flatten)]
    pub command: Command,
}
impl Request {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 || !(1..=MAX_SAFE).contains(&self.request_id) {
            return Err("invalid protocol version or request id".into());
        }
        match &self.command {
            Command::Query { target } => {
                handle(target)?;
            }
            Command::Start {
                target,
                process_id,
                capture_generation,
            } => {
                handle(target)?;
                if *process_id == 0 || !(1..=MAX_SAFE).contains(capture_generation) {
                    return Err("invalid capture identity".into());
                }
            }
            Command::Grab {
                target,
                capture_generation,
                session_epoch,
                region,
            } => {
                handle(target)?;
                if !(1..=MAX_SAFE).contains(capture_generation)
                    || !(1..=MAX_SAFE).contains(session_epoch)
                {
                    return Err("invalid capture identity".into());
                }
                if let Some(region) = region {
                    region.validate()?;
                }
            }
            Command::List | Command::Stop => {}
        }
        Ok(())
    }
}

pub fn handle(text: &str) -> Result<usize, String> {
    if text.is_empty() || text.starts_with('0') || !text.bytes().all(|b| b.is_ascii_digit()) {
        return Err("invalid window handle".into());
    }
    let value = text.parse::<u64>().map_err(|_| "invalid window handle")?;
    if value > MAX_SAFE {
        return Err("unsafe window handle".into());
    }
    usize::try_from(value).map_err(|_| "window handle overflow".into())
}

pub fn frame_size(width: u32, height: u32) -> Result<(usize, usize), String> {
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err("invalid frame dimensions".into());
    }
    let stride = (width as usize).checked_mul(4).ok_or("stride overflow")?;
    let bytes = stride
        .checked_mul(height as usize)
        .ok_or("payload overflow")?;
    if bytes > MAX_PAYLOAD {
        return Err("frame exceeds payload limit".into());
    }
    Ok((stride, bytes))
}

pub fn crop(client: Rect, region: Option<Region>) -> Result<(u32, u32, u32, u32), String> {
    let (width, height) = client.size()?;
    let Some(region) = region else {
        frame_size(width, height)?;
        return Ok((0, 0, width, height));
    };
    region.validate()?;
    let x = (region.x * f64::from(width)).round() as u32;
    let y = (region.y * f64::from(height)).round() as u32;
    let right = ((region.x + region.width) * f64::from(width)).round() as u32;
    let bottom = ((region.y + region.height) * f64::from(height)).round() as u32;
    if right > width || bottom > height {
        return Err("crop outside client".into());
    }
    let w = right.checked_sub(x).ok_or("invalid crop width")?;
    let h = bottom.checked_sub(y).ok_or("invalid crop height")?;
    frame_size(w, h)?;
    Ok((x, y, w, h))
}

pub fn read_request(reader: &mut impl Read) -> io::Result<Option<Request>> {
    let mut prefix = [0u8; 4];
    if reader.read(&mut prefix[..1])? == 0 {
        return Ok(None);
    }
    reader.read_exact(&mut prefix[1..])?;
    let length = u32::from_le_bytes(prefix) as usize;
    if length == 0 || length > MAX_HEADER {
        return Err(io::Error::other("invalid request header length"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    let object = value
        .as_object()
        .ok_or_else(|| io::Error::other("request must be an object"))?;
    let fields: &[&str] = match value["action"].as_str() {
        Some("list" | "stop") => &["version", "requestId", "action"],
        Some("query") => &["version", "requestId", "action", "target"],
        Some("start") => &[
            "version",
            "requestId",
            "action",
            "target",
            "processId",
            "captureGeneration",
        ],
        Some("grab") => &[
            "version",
            "requestId",
            "action",
            "target",
            "captureGeneration",
            "sessionEpoch",
            "region",
        ],
        _ => return Err(io::Error::other("unknown request action")),
    };
    if object.keys().any(|key| !fields.contains(&key.as_str())) {
        return Err(io::Error::other("unexpected request field"));
    }
    let request: Request = serde_json::from_value(value).map_err(io::Error::other)?;
    request.validate().map_err(io::Error::other)?;
    Ok(Some(request))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputFrame {
    target: String,
    capture_generation: u64,
    session_epoch: u64,
    sequence: u64,
    timestamp: u64,
    qpc_timestamp100ns: u64,
    pixel_format: String,
    width: u32,
    height: u32,
    stride: usize,
    payload_bytes: usize,
    client_rect: Rect,
    dpi: u32,
    crop_origin: CropOrigin,
}
#[derive(Deserialize)]
struct CropOrigin {
    x: u32,
    y: u32,
}
impl OutputFrame {
    fn validate(&self, bytes: usize) -> Result<(), String> {
        handle(&self.target)?;
        if ![
            self.capture_generation,
            self.session_epoch,
            self.sequence,
            self.timestamp,
            self.qpc_timestamp100ns,
        ]
        .into_iter()
        .all(|v| (1..=MAX_SAFE).contains(&v))
            || !(1..=9600).contains(&self.dpi)
            || self.pixel_format != "BGRA8"
        {
            return Err("invalid output frame identity, timestamp, DPI, or format".into());
        }
        let (stride, payload) = frame_size(self.width, self.height)?;
        let (client_width, client_height) = self.client_rect.size()?;
        let right = self
            .crop_origin
            .x
            .checked_add(self.width)
            .ok_or("crop overflow")?;
        let bottom = self
            .crop_origin
            .y
            .checked_add(self.height)
            .ok_or("crop overflow")?;
        if self.stride != stride
            || self.payload_bytes != payload
            || bytes != payload
            || right > client_width
            || bottom > client_height
        {
            return Err("invalid output payload or client-relative crop".into());
        }
        Ok(())
    }
}

pub fn write_message(
    writer: &mut impl Write,
    header: &serde_json::Value,
    pixels: &[u8],
) -> io::Result<()> {
    if pixels.len() > MAX_PAYLOAD {
        return Err(io::Error::other("oversized output payload"));
    }
    if header["version"].as_u64() != Some(1) {
        return Err(io::Error::other("invalid output protocol version"));
    }
    if header["kind"] != "event"
        && !header["requestId"]
            .as_u64()
            .is_some_and(|v| (1..=MAX_SAFE).contains(&v))
    {
        return Err(io::Error::other("invalid output request id"));
    }
    if header["kind"] == "frame" {
        let frame: OutputFrame =
            serde_json::from_value(header.clone()).map_err(io::Error::other)?;
        frame.validate(pixels.len()).map_err(io::Error::other)?;
    } else if !pixels.is_empty() || header.get("payloadBytes").is_some() {
        return Err(io::Error::other("unexpected output payload"));
    }
    let bytes = serde_json::to_vec(header).map_err(io::Error::other)?;
    if bytes.is_empty() || bytes.len() > MAX_HEADER {
        return Err(io::Error::other("oversized output header"));
    }
    writer.write_all(&(bytes.len() as u32).to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.write_all(pixels)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_lengths_and_truncation() {
        for length in [0u32, 65537, u32::MAX] {
            assert!(read_request(&mut length.to_le_bytes().as_slice()).is_err());
        }
        assert!(read_request(&mut [10, 0, 0, 0, b'{'].as_slice()).is_err());
        assert!(read_request(&mut [].as_slice()).unwrap().is_none());
    }
    #[test]
    fn validates_identity_before_dispatch() {
        for json in [
            r#"{"version":2,"requestId":1,"action":"list"}"#,
            r#"{"version":1,"requestId":0,"action":"list"}"#,
            r#"{"version":1,"requestId":1,"action":"query","target":"0"}"#,
        ] {
            let mut bytes = (json.len() as u32).to_le_bytes().to_vec();
            bytes.extend(json.as_bytes());
            assert!(read_request(&mut bytes.as_slice()).is_err());
        }
    }
    #[test]
    fn crop_and_checked_payload_limits() {
        let client = Rect {
            left: -2000,
            top: 100,
            right: 560,
            bottom: 1540,
        };
        assert_eq!(
            crop(
                client,
                Some(Region {
                    x: 0.25,
                    y: 0.5,
                    width: 0.5,
                    height: 0.25
                })
            )
            .unwrap(),
            (640, 720, 1280, 360)
        );
        assert_eq!(frame_size(2560, 1440).unwrap(), (10240, 14745600));
        assert!(frame_size(32768, 32768).is_err());
        assert!(frame_size(u32::MAX, 1).is_err());
        assert!(
            crop(
                client,
                Some(Region {
                    x: 0.8,
                    y: 0.0,
                    width: 0.5,
                    height: 0.5
                })
            )
            .is_err()
        );
        assert!(
            crop(
                Rect {
                    left: i32::MIN,
                    top: 0,
                    right: i32::MAX,
                    bottom: 1
                },
                None
            )
            .is_err()
        );
    }
    fn output_header() -> serde_json::Value {
        serde_json::json!({"version":1,"requestId":1,"kind":"frame","target":"42","captureGeneration":1,"sessionEpoch":1,"sequence":1,
            "timestamp":1000,"qpcTimestamp100ns":100000,"pixelFormat":"BGRA8","width":2,"height":2,"stride":8,"payloadBytes":16,
            "clientRect":{"left":-20,"top":10,"right":-16,"bottom":14},"dpi":120,"cropOrigin":{"x":1,"y":1}})
    }
    #[test]
    fn refuses_partial_output_before_writing() {
        let mut output = Vec::new();
        assert!(write_message(&mut output, &output_header(), &[0; 12]).is_err());
        assert!(output.is_empty());
        write_message(&mut output, &output_header(), &[7; 16]).unwrap();
        let length = u32::from_le_bytes(output[..4].try_into().unwrap()) as usize;
        assert_eq!(&output[4 + length..], &[7; 16]);
    }
    #[test]
    fn validates_output_identity_geometry_and_clock_before_writing() {
        for (field, value) in [
            ("target", serde_json::json!("0")),
            ("captureGeneration", serde_json::json!(0)),
            ("sessionEpoch", serde_json::json!(0)),
            ("sequence", serde_json::json!(0)),
            ("timestamp", serde_json::json!(0)),
            ("qpcTimestamp100ns", serde_json::json!(MAX_SAFE + 1)),
            ("dpi", serde_json::json!(0)),
            ("stride", serde_json::json!(12)),
            ("cropOrigin", serde_json::json!({"x":3,"y":1})),
            (
                "clientRect",
                serde_json::json!({"left":0,"top":0,"right":1,"bottom":1}),
            ),
        ] {
            let mut header = output_header();
            header[field] = value;
            let mut output = Vec::new();
            assert!(
                write_message(&mut output, &header, &[0; 16]).is_err(),
                "{field}"
            );
            assert!(output.is_empty());
        }
    }
}
