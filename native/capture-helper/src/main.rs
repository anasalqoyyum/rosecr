mod protocol;
#[cfg(windows)]
mod windows_capture;

#[cfg(windows)]
fn main() {
    if let Err(error) = windows_capture::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
#[cfg(not(windows))]
fn main() {
    eprintln!("rosecr-capture-helper requires Windows 11 x64");
    std::process::exit(1);
}
