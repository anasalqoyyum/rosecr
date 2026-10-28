use crate::protocol::{self, Command, MAX_SAFE, Rect, Region, Request};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    io,
    mem::size_of,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use windows::{
    Foundation::{TimeSpan, TypedEventHandler},
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{CloseHandle, E_FAIL, E_INVALIDARG, HMODULE, HWND, LPARAM, POINT, RECT},
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::*,
            Dwm::{DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute},
            Dxgi::{
                Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC},
                DXGI_ERROR_DEVICE_HUNG, DXGI_ERROR_DEVICE_REMOVED, DXGI_ERROR_DEVICE_RESET,
                IDXGIDevice,
            },
            Gdi::ClientToScreen,
        },
        System::{
            Performance::{QueryPerformanceCounter, QueryPerformanceFrequency},
            Threading::{
                OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
                QueryFullProcessImageNameW,
            },
            WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
                RO_INIT_MULTITHREADED, RoInitialize,
            },
        },
        UI::{
            HiDpi::{
                DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForWindow,
                SetProcessDpiAwarenessContext,
            },
            WindowsAndMessaging::*,
        },
    },
    core::{self, Interface, PWSTR},
};

fn invalid(message: &str) -> core::Error {
    core::Error::new(E_INVALIDARG, message)
}
fn failure(message: &str) -> core::Error {
    core::Error::new(E_FAIL, message)
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn qpc_100ns() -> core::Result<u64> {
    let mut counter = 0;
    let mut frequency = 0;
    unsafe {
        QueryPerformanceCounter(&mut counter)?;
        QueryPerformanceFrequency(&mut frequency)?;
    }
    if counter <= 0 || frequency <= 0 {
        return Err(failure("invalid QPC clock"));
    }
    let ticks = (counter as u128)
        .checked_mul(10_000_000)
        .ok_or_else(|| failure("QPC overflow"))?
        / frequency as u128;
    if ticks > u128::from(MAX_SAFE) {
        return Err(failure("unsafe QPC timestamp"));
    }
    Ok(ticks as u64)
}
fn hwnd(target: &str) -> core::Result<HWND> {
    Ok(HWND(
        protocol::handle(target).map_err(|e| invalid(&e))? as *mut _
    ))
}
fn pid(window: HWND) -> u32 {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(window, Some(&mut pid));
    }
    pid
}
fn reject_own(window: HWND, parent: u32) -> core::Result<()> {
    let owner = pid(window);
    if owner == parent || owner == std::process::id() {
        return Err(invalid("Rosecr windows cannot be captured"));
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    exists: bool,
    visible: bool,
    minimized: bool,
    capturable: bool,
    dpi: u32,
    foreground_handle: String,
    target_is_foreground: bool,
    client_rect: Option<Rect>,
    timestamp: u64,
}
fn metadata(window: HWND, parent: u32) -> core::Result<Metadata> {
    reject_own(window, parent)?;
    let exists = unsafe { IsWindow(Some(window)).as_bool() };
    let visible = exists && unsafe { IsWindowVisible(window).as_bool() };
    let minimized = exists && unsafe { IsIconic(window).as_bool() };
    let foreground = unsafe { GetForegroundWindow() };
    let dpi = if exists {
        unsafe { GetDpiForWindow(window) }
    } else {
        96
    };
    let mut client_rect = None;
    if exists && !minimized {
        let mut rect = RECT::default();
        if unsafe { GetClientRect(window, &mut rect) }.is_ok() {
            let mut origin = POINT {
                x: rect.left,
                y: rect.top,
            };
            let width = rect.right.checked_sub(rect.left);
            let height = rect.bottom.checked_sub(rect.top);
            if unsafe { ClientToScreen(window, &mut origin).as_bool() } {
                let right = width.and_then(|width| origin.x.checked_add(width));
                let bottom = height.and_then(|height| origin.y.checked_add(height));
                let (Some(right), Some(bottom)) = (right, bottom) else {
                    return Err(failure("physical client rectangle overflow"));
                };
                let client = Rect {
                    left: origin.x,
                    top: origin.y,
                    right,
                    bottom,
                };
                if client.size().is_ok() {
                    client_rect = Some(client);
                }
            }
        }
    }
    let mut affinity = 0;
    let protected =
        unsafe { GetWindowDisplayAffinity(window, &mut affinity) }.is_ok() && affinity != 0;
    let mut cloaked = 0u32;
    let cloak_known = unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_CLOAKED,
            (&mut cloaked as *mut u32).cast(),
            size_of::<u32>() as u32,
        )
    }
    .is_ok();
    Ok(Metadata {
        exists,
        visible,
        minimized,
        capturable: exists
            && visible
            && !minimized
            && !protected
            && (1..=9600).contains(&dpi)
            && cloak_known
            && cloaked == 0
            && client_rect.is_some(),
        dpi: if (1..=9600).contains(&dpi) { dpi } else { 96 },
        foreground_handle: (foreground.0 as usize).to_string(),
        target_is_foreground: foreground == window,
        client_rect,
        timestamp: now_ms(),
    })
}
fn executable_name(owner: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, owner) else {
            return String::new();
        };
        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(handle);
        if result.is_err() {
            return String::new();
        }
        String::from_utf16_lossy(&buffer[..length as usize])
            .rsplit('\\')
            .next()
            .unwrap_or_default()
            .to_owned()
    }
}
struct Catalog {
    parent: u32,
    windows: Vec<Value>,
    overflow: bool,
}
unsafe extern "system" fn enumerate(window: HWND, parameter: LPARAM) -> core::BOOL {
    let catalog = unsafe { &mut *(parameter.0 as *mut Catalog) };
    if reject_own(window, catalog.parent).is_err() || !unsafe { IsWindowVisible(window).as_bool() }
    {
        return true.into();
    }
    let mut title = [0u16; 1024];
    let mut class = [0u16; 256];
    let title_len = unsafe { GetWindowTextW(window, &mut title) }.max(0) as usize;
    let class_len = unsafe { GetClassNameW(window, &mut class) }.max(0) as usize;
    if title_len == 0 {
        return true.into();
    }
    let owner = pid(window);
    if owner == 0 {
        return true.into();
    }
    if catalog.windows.len() >= 256 {
        catalog.overflow = true;
        return true.into();
    }
    catalog.windows.push(json!({"handle":(window.0 as usize).to_string(),"title":String::from_utf16_lossy(&title[..title_len]),
        "processId":owner,"executableName":executable_name(owner),"className":String::from_utf16_lossy(&class[..class_len])}));
    true.into()
}
fn list(parent: u32) -> core::Result<Vec<Value>> {
    let mut catalog = Catalog {
        parent,
        windows: Vec::new(),
        overflow: false,
    };
    unsafe {
        EnumWindows(
            Some(enumerate),
            LPARAM((&mut catalog as *mut Catalog) as isize),
        )?;
    }
    if catalog.overflow
        || serde_json::to_vec(&catalog.windows)
            .map_err(|_| failure("cannot serialize catalog"))?
            .len()
            > protocol::MAX_HEADER - 256
    {
        return Err(failure("window catalog exceeds protocol header limit"));
    }
    Ok(catalog.windows)
}
fn extent(window: HWND) -> core::Result<Rect> {
    let mut rect = RECT::default();
    unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&mut rect as *mut RECT).cast(),
            size_of::<RECT>() as u32,
        )?;
    }
    let rect = Rect {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
    };
    rect.size().map_err(|e| invalid(&e))?;
    Ok(rect)
}
fn same_geometry(a: &Metadata, b: &Metadata) -> bool {
    a.dpi == b.dpi && a.client_rect == b.client_rect
}
fn device_loss(error: &core::Error) -> bool {
    [
        DXGI_ERROR_DEVICE_REMOVED,
        DXGI_ERROR_DEVICE_RESET,
        DXGI_ERROR_DEVICE_HUNG,
    ]
    .contains(&error.code())
}

struct Frame {
    width: u32,
    height: u32,
    x: u32,
    y: u32,
    qpc: u64,
    metadata: Metadata,
    pixels: Vec<u8>,
}
struct Session {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    winrt: IDirect3DDevice,
    item: GraphicsCaptureItem,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    closed: Arc<AtomicBool>,
    closed_token: i64,
    metadata: Metadata,
    extent: Rect,
    fresh_after: u64,
    last_frame_qpc: u64,
    border_disabled: bool,
    min_update_interval: Option<i64>,
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.item.RemoveClosed(self.closed_token);
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}
impl Session {
    fn new(window: HWND, metadata: Metadata) -> core::Result<Self> {
        if !GraphicsCaptureSession::IsSupported()? {
            return Err(failure("Windows Graphics Capture is unavailable"));
        }
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
        }
        let device = device.ok_or_else(|| failure("D3D11 device missing"))?;
        let context = context.ok_or_else(|| failure("D3D11 context missing"))?;
        let dxgi: IDXGIDevice = device.cast()?;
        let winrt: IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let interop: IGraphicsCaptureItemInterop =
            core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(window)? };
        let extent = extent(window)?;
        let size = item.Size()?;
        let (width, height) = extent.size().map_err(|e| invalid(&e))?;
        if size.Width != width as i32 || size.Height != height as i32 {
            return Err(failure("WGC window origin cannot be matched to DWM bounds"));
        }
        protocol::frame_size(width, height).map_err(|e| invalid(&e))?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        session.SetIsCursorCaptureEnabled(false)?;
        let border_disabled = session.SetIsBorderRequired(false).is_ok()
            && session.IsBorderRequired().is_ok_and(|required| !required);
        // Older Windows 11 builds do not expose this property; capture remains pull-driven.
        let min_update_interval = if session
            .SetMinUpdateInterval(TimeSpan {
                Duration: 1_500_000,
            })
            .is_ok()
        {
            session.MinUpdateInterval().ok().map(|value| value.Duration)
        } else {
            None
        };
        let closed = Arc::new(AtomicBool::new(false));
        let flag = closed.clone();
        let closed_token = item.Closed(&TypedEventHandler::<
            GraphicsCaptureItem,
            core::IInspectable,
        >::new(move |_, _| {
            flag.store(true, Ordering::Release);
            Ok(())
        }))?;
        let fresh_after = qpc_100ns()?;
        if let Err(error) = session.StartCapture() {
            let _ = item.RemoveClosed(closed_token);
            let _ = session.Close();
            let _ = pool.Close();
            return Err(error);
        }
        Ok(Self {
            device,
            context,
            winrt,
            item,
            pool,
            session,
            closed,
            closed_token,
            metadata,
            extent,
            fresh_after,
            last_frame_qpc: 0,
            border_disabled,
            min_update_interval,
        })
    }
    fn recreate(&mut self, metadata: Metadata, extent: Rect) -> core::Result<()> {
        let (width, height) = extent.size().map_err(|e| invalid(&e))?;
        protocol::frame_size(width, height).map_err(|e| invalid(&e))?;
        self.pool.Recreate(
            &self.winrt,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            SizeInt32 {
                Width: width as i32,
                Height: height as i32,
            },
        )?;
        self.metadata = metadata;
        self.extent = extent;
        self.fresh_after = qpc_100ns()?;
        Ok(())
    }
    fn frame(
        &mut self,
        window: HWND,
        parent: u32,
        region: Option<Region>,
    ) -> core::Result<Option<Frame>> {
        unsafe {
            self.device.GetDeviceRemovedReason()?;
        }
        let mut latest = None;
        // The pool has two buffers. Never spin on a producer that keeps delivering frames.
        for _ in 0..2 {
            match self.pool.TryGetNextFrame() {
                Ok(frame) => {
                    if let Some(previous) = latest.replace(frame) {
                        let _ = previous.Close();
                    }
                }
                Err(error) if error.code() == windows::Win32::Foundation::E_POINTER => break,
                Err(error) => return Err(error),
            }
        }
        let Some(frame) = latest else {
            return Ok(None);
        };
        let result = (|| {
            let ticks = frame.SystemRelativeTime()?.Duration;
            if ticks <= 0 || ticks as u64 > MAX_SAFE {
                return Err(failure("invalid WGC frame timestamp"));
            }
            let qpc = ticks as u64;
            if qpc < self.fresh_after || qpc <= self.last_frame_qpc {
                return Ok(None);
            }
            let size = frame.ContentSize()?;
            let (outer_width, outer_height) = self.extent.size().map_err(|e| invalid(&e))?;
            if size.Width != outer_width as i32 || size.Height != outer_height as i32 {
                return Ok(None);
            }
            let client = self
                .metadata
                .client_rect
                .ok_or_else(|| failure("missing client geometry"))?;
            let (x, y, width, height) = protocol::crop(client, region).map_err(|e| invalid(&e))?;
            let left = i64::from(client.left) - i64::from(self.extent.left) + i64::from(x);
            let top = i64::from(client.top) - i64::from(self.extent.top) + i64::from(y);
            if left < 0
                || top < 0
                || left + i64::from(width) > i64::from(outer_width)
                || top + i64::from(height) > i64::from(outer_height)
            {
                return Err(failure("client crop outside WGC content"));
            }
            let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
            let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            unsafe {
                texture.GetDesc(&mut desc);
            }
            if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM
                || desc.Width < outer_width
                || desc.Height < outer_height
                || desc.SampleDesc.Count != 1
            {
                return Err(failure("unexpected WGC texture format or size"));
            }
            let pixels = self.readback(&texture, left as u32, top as u32, width, height)?;
            let after = metadata(window, parent)?;
            if !after.capturable
                || !same_geometry(&self.metadata, &after)
                || extent(window)? != self.extent
            {
                return Ok(None);
            }
            self.last_frame_qpc = qpc;
            Ok(Some(Frame {
                width,
                height,
                x,
                y,
                qpc,
                metadata: after,
                pixels,
            }))
        })();
        let close_result = frame.Close();
        match result {
            Err(error) => Err(error),
            Ok(value) => {
                close_result?;
                Ok(value)
            }
        }
    }
    fn readback(
        &self,
        texture: &ID3D11Texture2D,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    ) -> core::Result<Vec<u8>> {
        let (stride, bytes) = protocol::frame_size(width, height).map_err(|e| invalid(&e))?;
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            ..Default::default()
        };
        let mut staging = None;
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut staging))?;
        }
        let staging = staging.ok_or_else(|| failure("missing staging texture"))?;
        let source = D3D11_BOX {
            left: x,
            top: y,
            front: 0,
            right: x
                .checked_add(width)
                .ok_or_else(|| invalid("crop overflow"))?,
            bottom: y
                .checked_add(height)
                .ok_or_else(|| invalid("crop overflow"))?,
            back: 1,
        };
        unsafe {
            self.context
                .CopySubresourceRegion(&staging, 0, 0, 0, 0, texture, 0, Some(&source));
        }
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        }
        let result = (|| {
            let row_pitch = mapped.RowPitch as usize;
            let mapped_bytes = row_pitch
                .checked_mul(height as usize)
                .ok_or_else(|| failure("mapped pitch overflow"))?;
            if mapped.pData.is_null() || row_pitch < stride || mapped_bytes > protocol::MAX_PAYLOAD
            {
                return Err(failure("invalid mapped texture pitch"));
            }
            let mut pixels = vec![0u8; bytes];
            for row in 0..height as usize {
                // D3D11 owns this mapped allocation until Unmap. Pitch and both slices are bounded above.
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        (mapped.pData as *const u8).add(row * row_pitch),
                        pixels.as_mut_ptr().add(row * stride),
                        stride,
                    );
                }
            }
            Ok(pixels)
        })();
        unsafe {
            self.context.Unmap(&staging, 0);
        }
        result
    }
}

struct Capture {
    target: String,
    owner: u32,
    generation: u64,
    epoch: u64,
    sequence: u64,
    session: Option<Session>,
    recovering: bool,
}
struct Helper {
    parent: u32,
    epoch: u64,
    capture: Option<Capture>,
}
impl Helper {
    fn event(
        writer: &mut impl io::Write,
        capture: &mut Capture,
        event: &str,
        message: &str,
    ) -> io::Result<()> {
        let qpc = qpc_100ns().map_err(io::Error::other)?;
        if matches!(event, "geometryChanged" | "deviceRecovered") {
            if let Some(session) = capture.session.as_mut() {
                session.fresh_after = session.fresh_after.max(qpc);
            }
        }
        protocol::write_message(
            writer,
            &json!({"version":1,"kind":"event","target":capture.target,"captureGeneration":capture.generation,"sessionEpoch":capture.epoch,"event":event,"message":message,"timestamp":now_ms(),"qpcTimestamp100ns":qpc}),
            &[],
        )
    }
    fn observe(&mut self, writer: &mut impl io::Write) -> io::Result<()> {
        let Some(capture) = self.capture.as_mut() else {
            return Ok(());
        };
        let window = hwnd(&capture.target).map_err(io::Error::other)?;
        let metadata = metadata(window, self.parent).map_err(io::Error::other)?;
        let closed = !metadata.exists
            || pid(window) != capture.owner
            || capture
                .session
                .as_ref()
                .is_some_and(|s| s.closed.load(Ordering::Acquire));
        if closed || !metadata.capturable {
            Self::event(
                writer,
                capture,
                if closed {
                    "closed"
                } else if metadata.minimized {
                    "minimized"
                } else {
                    "unavailable"
                },
                "target is closed, minimized, protected, or unavailable",
            )?;
            self.capture = None;
            return Ok(());
        }
        if capture.recovering {
            match Session::new(window, metadata) {
                Ok(session) => {
                    self.epoch = self
                        .epoch
                        .checked_add(1)
                        .filter(|v| *v <= MAX_SAFE)
                        .ok_or_else(|| io::Error::other("epoch overflow"))?;
                    capture.epoch = self.epoch;
                    capture.sequence = 0;
                    capture.session = Some(session);
                    capture.recovering = false;
                    Self::event(
                        writer,
                        capture,
                        "deviceRecovered",
                        "new WGC device and session created",
                    )?;
                }
                Err(error) => {
                    Self::event(
                        writer,
                        capture,
                        "unavailable",
                        &format!("device recovery failed: {error}"),
                    )?;
                    self.capture = None;
                }
            }
            return Ok(());
        }
        if let Some(session) = capture.session.as_mut() {
            let result = (|| {
                unsafe {
                    session.device.GetDeviceRemovedReason()?;
                }
                let outer = extent(window)?;
                if !same_geometry(&session.metadata, &metadata) || outer != session.extent {
                    session.recreate(metadata, outer)?;
                    return Ok(true);
                }
                Ok(false)
            })();
            match result {
                Ok(true) => {
                    self.epoch = self
                        .epoch
                        .checked_add(1)
                        .filter(|v| *v <= MAX_SAFE)
                        .ok_or_else(|| io::Error::other("epoch overflow"))?;
                    capture.epoch = self.epoch;
                    capture.sequence = 0;
                    Self::event(
                        writer,
                        capture,
                        "geometryChanged",
                        "client geometry or DPI changed; frame pool recreated",
                    )?;
                }
                Ok(false) => {}
                Err(error) => Self::capture_error(writer, capture, error)?,
            }
        }
        Ok(())
    }
    fn capture_error(
        writer: &mut impl io::Write,
        capture: &mut Capture,
        error: core::Error,
    ) -> io::Result<()> {
        let lost = device_loss(&error)
            || capture
                .session
                .as_ref()
                .is_some_and(|s| unsafe { s.device.GetDeviceRemovedReason() }.is_err());
        Self::event(
            writer,
            capture,
            if lost { "deviceLost" } else { "unavailable" },
            &error.to_string(),
        )?;
        capture.session = None;
        capture.recovering = lost;
        Ok(())
    }
    fn request(&mut self, request: Request, writer: &mut impl io::Write) -> io::Result<()> {
        let id = request.request_id;
        let mut reply = |kind: &str, fields: Value, pixels: &[u8]| -> io::Result<()> {
            let mut header = json!({"version":1,"kind":kind,"requestId":id});
            if let Some(fields) = fields.as_object() {
                for (key, value) in fields {
                    header[key] = value.clone();
                }
            }
            protocol::write_message(writer, &header, pixels)
        };
        match request.command {
            Command::List => match list(self.parent) {
                Ok(windows) => reply("list", json!({"windows":windows}), &[]),
                Err(error) => reply("error", json!({"message":error.to_string()}), &[]),
            },
            Command::Query { target } => match hwnd(&target).and_then(|w| metadata(w, self.parent))
            {
                Ok(metadata) => reply("metadata", json!({"metadata":metadata}), &[]),
                Err(error) => reply("error", json!({"message":error.to_string()}), &[]),
            },
            Command::Stop => {
                self.capture = None;
                reply("stopped", json!({}), &[])
            }
            Command::Start {
                target,
                process_id,
                capture_generation,
            } => {
                self.capture = None;
                let result = (|| {
                    let window = hwnd(&target)?;
                    let metadata = metadata(window, self.parent)?;
                    if !metadata.capturable || pid(window) != process_id {
                        return Err(failure("target is unavailable or its owner changed"));
                    }
                    Session::new(window, metadata)
                })();
                match result {
                    Ok(session) => {
                        self.epoch = self
                            .epoch
                            .checked_add(1)
                            .filter(|v| *v <= MAX_SAFE)
                            .ok_or_else(|| io::Error::other("epoch overflow"))?;
                        reply(
                            "started",
                            json!({"target":target,"captureGeneration":capture_generation,"sessionEpoch":self.epoch,"borderDisabled":session.border_disabled,"cursorDisabled":true,"minUpdateInterval100ns":session.min_update_interval}),
                            &[],
                        )?;
                        self.capture = Some(Capture {
                            target,
                            owner: process_id,
                            generation: capture_generation,
                            epoch: self.epoch,
                            sequence: 0,
                            session: Some(session),
                            recovering: false,
                        });
                        Ok(())
                    }
                    Err(error) => reply("waiting", json!({"message":error.to_string()}), &[]),
                }
            }
            Command::Grab {
                target,
                capture_generation,
                session_epoch,
                region,
            } => {
                let Some(capture) = self.capture.as_mut() else {
                    return reply("waiting", json!({"message":"no active capture"}), &[]);
                };
                if capture.target != target
                    || capture.generation != capture_generation
                    || capture.epoch != session_epoch
                {
                    return reply(
                        "waiting",
                        json!({"message":"capture identity changed"}),
                        &[],
                    );
                }
                let Some(session) = capture.session.as_mut() else {
                    return reply("waiting", json!({"message":"device recovery pending"}), &[]);
                };
                let window = hwnd(&target).map_err(io::Error::other)?;
                match session.frame(window, self.parent, region) {
                    Ok(Some(frame)) => {
                        if frame
                            .pixels
                            .chunks_exact(4)
                            .all(|pixel| pixel[..3] == [0, 0, 0])
                        {
                            reply(
                                "waiting",
                                json!({"message":"target emitted a blank frame"}),
                                &[],
                            )?;
                            Self::event(
                                writer,
                                capture,
                                "blank",
                                "target emitted a blank or protected frame",
                            )
                        } else {
                            capture.sequence = capture
                                .sequence
                                .checked_add(1)
                                .filter(|v| *v <= MAX_SAFE)
                                .ok_or_else(|| io::Error::other("sequence overflow"))?;
                            reply(
                                "frame",
                                json!({"target":target,"captureGeneration":capture_generation,"sessionEpoch":capture.epoch,"sequence":capture.sequence,
                                "timestamp":now_ms(),"qpcTimestamp100ns":frame.qpc,"pixelFormat":"BGRA8","width":frame.width,"height":frame.height,
                                "stride":frame.width * 4,"payloadBytes":frame.pixels.len(),"clientRect":frame.metadata.client_rect,"dpi":frame.metadata.dpi,"cropOrigin":{"x":frame.x,"y":frame.y}}),
                                &frame.pixels,
                            )
                        }
                    }
                    Ok(None) => reply("waiting", json!({"message":"no fresh matching frame"}), &[]),
                    Err(error) => {
                        reply("waiting", json!({"message":error.to_string()}), &[])?;
                        Self::capture_error(writer, capture, error)
                    }
                }
            }
        }
    }
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    if !cfg!(target_arch = "x86_64") {
        return Err("native capture helper requires x64".into());
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 || args[0] != "--parent-pid" {
        return Err("expected --parent-pid <Rosecr PID>".into());
    }
    let parent: u32 = args[1].parse()?;
    if parent == 0 || parent == std::process::id() {
        return Err("invalid parent PID".into());
    }
    unsafe {
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)?;
        RoInitialize(RO_INIT_MULTITHREADED)?;
    }
    let (send, receive) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        loop {
            match protocol::read_request(&mut input) {
                Ok(Some(request)) => {
                    if send.send(Ok(request)).is_err() {
                        break;
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    let _ = send.send(Err(error));
                    break;
                }
            }
        }
    });
    let mut helper = Helper {
        parent,
        epoch: 0,
        capture: None,
    };
    let mut output = io::stdout().lock();
    loop {
        match receive.recv_timeout(Duration::from_millis(100)) {
            Ok(request) => {
                helper.observe(&mut output)?;
                helper.request(request?, &mut output)?;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => helper.observe(&mut output)?,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    Ok(())
}
