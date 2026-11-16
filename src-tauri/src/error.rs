use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    IoError(String),

    #[error("FFmpeg engine is not installed")]
    FfmpegMissing(String),

    #[error("Unsupported file or format: {0}")]
    UnsupportedFormat(String),

    #[error("Media encoding failed: {0}")]
    EncodeFailed(String),

    #[error("Checksum verification failed: {0}")]
    ChecksumMismatch(String),

    #[error("Invalid operation or state: {0}")]
    InvalidState(String),

    #[error("OS process control error: {0}")]
    ProcessError(String),
}

#[derive(Serialize)]
struct SerializedError<'a> {
    code: &'a str,
    message: String,
    details: Option<String>,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::IoError(_) => "IO_ERROR",
            AppError::FfmpegMissing(_) => "FFMPEG_MISSING",
            AppError::UnsupportedFormat(_) => "UNSUPPORTED_FORMAT",
            AppError::EncodeFailed(_) => "ENCODE_FAILED",
            AppError::ChecksumMismatch(_) => "CHECKSUM_MISMATCH",
            AppError::InvalidState(_) => "INVALID_STATE",
            AppError::ProcessError(_) => "PROCESS_ERROR",
        }
    }

    pub fn details(&self) -> Option<String> {
        match self {
            AppError::IoError(d)
            | AppError::FfmpegMissing(d)
            | AppError::UnsupportedFormat(d)
            | AppError::EncodeFailed(d)
            | AppError::ChecksumMismatch(d)
            | AppError::InvalidState(d)
            | AppError::ProcessError(d) => Some(d.clone()),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerializedError {
            code: self.code(),
            message: self.to_string(),
            details: self.details(),
        }
        .serialize(serializer)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::IoError(format!("JSON error: {err}"))
    }
}
