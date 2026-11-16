use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::AppError;

#[derive(Default)]
pub struct ActiveProcessRegistry {
    pids: Mutex<HashMap<String, u32>>,
}

impl ActiveProcessRegistry {
    pub fn register(&self, job_id: &str, pid: u32) {
        if let Ok(mut map) = self.pids.lock() {
            map.insert(job_id.to_string(), pid);
        }
    }

    pub fn unregister(&self, job_id: &str) {
        if let Ok(mut map) = self.pids.lock() {
            map.remove(job_id);
        }
    }

    pub fn get_pid(&self, job_id: &str) -> Option<u32> {
        self.pids.lock().ok().and_then(|map| map.get(job_id).copied())
    }

    pub fn kill_all(&self) {
        let entries: Vec<(String, u32)> = self
            .pids
            .lock()
            .map(|mut map| map.drain().collect())
            .unwrap_or_default();

        for (_id, pid) in entries {
            let _ = kill_process(pid);
        }
    }
}

#[cfg(windows)]
pub fn suspend_process(pid: u32) -> Result<(), AppError> {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SUSPEND_RESUME};

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSuspendProcess(process_handle: HANDLE) -> i32;
    }

    unsafe {
        let handle = OpenProcess(PROCESS_SUSPEND_RESUME, 0, pid);
        if handle.is_null() {
            return Err(AppError::ProcessError(format!(
                "Failed to open process {pid} for suspend"
            )));
        }
        let status = NtSuspendProcess(handle);
        CloseHandle(handle);
        if status < 0 {
            return Err(AppError::ProcessError(format!(
                "NtSuspendProcess failed with NTSTATUS 0x{status:08X}"
            )));
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn resume_process(pid: u32) -> Result<(), AppError> {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SUSPEND_RESUME};

    #[link(name = "ntdll")]
    extern "system" {
        fn NtResumeProcess(process_handle: HANDLE) -> i32;
    }

    unsafe {
        let handle = OpenProcess(PROCESS_SUSPEND_RESUME, 0, pid);
        if handle.is_null() {
            return Err(AppError::ProcessError(format!(
                "Failed to open process {pid} for resume"
            )));
        }
        let status = NtResumeProcess(handle);
        CloseHandle(handle);
        if status < 0 {
            return Err(AppError::ProcessError(format!(
                "NtResumeProcess failed with NTSTATUS 0x{status:08X}"
            )));
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn kill_process(pid: u32) -> Result<(), AppError> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return Ok(());
        }
        let ok = TerminateProcess(handle, 1);
        CloseHandle(handle);
        if ok == 0 {
            return Err(AppError::ProcessError(format!(
                "TerminateProcess failed for PID {pid}"
            )));
        }
    }
    Ok(())
}

#[cfg(unix)]
pub fn suspend_process(pid: u32) -> Result<(), AppError> {
    let rc = unsafe { libc::kill(pid as libc::pid_t, libc::SIGSTOP) };
    if rc != 0 {
        return Err(AppError::ProcessError(format!(
            "Failed to send SIGSTOP to PID {pid}: {}",
            std::io::Error::last_os_error()
        )));
    }
    Ok(())
}

#[cfg(unix)]
pub fn resume_process(pid: u32) -> Result<(), AppError> {
    let rc = unsafe { libc::kill(pid as libc::pid_t, libc::SIGCONT) };
    if rc != 0 {
        return Err(AppError::ProcessError(format!(
            "Failed to send SIGCONT to PID {pid}: {}",
            std::io::Error::last_os_error()
        )));
    }
    Ok(())
}

#[cfg(unix)]
pub fn kill_process(pid: u32) -> Result<(), AppError> {
    let rc = unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
    if rc != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            return Err(AppError::ProcessError(format!(
                "Failed to send SIGKILL to PID {pid}: {err}"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn suspends_resumes_and_kills_child_process() {
        #[cfg(windows)]
        let mut child = Command::new("cmd")
            .args(["/C", "ping -n 10 127.0.0.1 >nul"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn dummy windows process");

        #[cfg(unix)]
        let mut child = Command::new("sleep")
            .arg("10")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn dummy unix process");

        let pid = child.id();
        suspend_process(pid).expect("suspend child process");
        resume_process(pid).expect("resume child process");
        kill_process(pid).expect("kill child process");
        let _ = child.wait();
    }
}
