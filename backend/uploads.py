"""Early upload validation for ``POST /analyze`` (no audio bytes logged)."""

from __future__ import annotations

from pathlib import Path

ALLOWED_AUDIO_SUFFIXES = frozenset({".webm", ".ogg", ".wav", ".mp3", ".m4a"})

# Soft allowlist: missing / octet-stream / common MediaRecorder types are accepted
# when the filename suffix is allowed.
ALLOWED_AUDIO_CONTENT_TYPES = frozenset(
    {
        "audio/webm",
        "audio/ogg",
        "application/ogg",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/x-m4a",
        "audio/aac",
        "audio/x-aac",
        "video/webm",
        "application/octet-stream",
    }
)


class UploadValidationError(Exception):
    """Raised when an upload is rejected before inference."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def parse_content_length(raw: str | None) -> int | None:
    if raw is None or not raw.strip():
        return None
    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise UploadValidationError(
            400,
            "Capçalera Content-Length no vàlida.",
        ) from exc
    if value < 0:
        raise UploadValidationError(400, "Capçalera Content-Length no vàlida.")
    return value


def reject_oversized_content_length(raw: str | None, *, max_bytes: int) -> None:
    length = parse_content_length(raw)
    if length is not None and length > max_bytes:
        raise UploadValidationError(413, "L'àudio enviat és massa gran.")


def normalize_audio_suffix(filename: str | None) -> str:
    """Return a lower-case suffix; default ``.webm`` when missing (filename never logged)."""
    suffix = Path(filename or "recording.webm").suffix.lower()
    return suffix if suffix else ".webm"


def content_type_allowed(content_type: str | None) -> bool:
    if content_type is None:
        return True
    media = content_type.split(";", 1)[0].strip().lower()
    if not media:
        return True
    return media in ALLOWED_AUDIO_CONTENT_TYPES


def validate_audio_upload(
    *,
    filename: str | None,
    content_type: str | None,
    content_length_header: str | None,
    max_bytes: int,
) -> str:
    """Validate size header + suffix/MIME; return the normalized suffix."""
    reject_oversized_content_length(content_length_header, max_bytes=max_bytes)
    suffix = normalize_audio_suffix(filename)
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise UploadValidationError(
            415,
            "Format d'àudio no admès. Usa webm, ogg, wav, mp3 o m4a.",
        )
    if not content_type_allowed(content_type):
        raise UploadValidationError(
            415,
            "Tipus de contingut d'àudio no admès.",
        )
    return suffix
