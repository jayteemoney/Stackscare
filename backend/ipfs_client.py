"""
IPFS client using Pinata.
Docs: https://docs.pinata.cloud/api-reference/endpoint/upload-a-file

Encryption is done with AES-256-GCM (Fernet) before upload so the data
stored on IPFS is always ciphertext — the decryption key never leaves
the patient's custody.

Dev mode: when Pinata credentials are not configured, a deterministic
mock CID is returned so the rest of the flow (blockchain registration,
AI analysis) can be tested without a Pinata account.
"""

import asyncio
import base64
import hashlib
import logging
import os
import httpx
from cryptography.fernet import Fernet
from config import get_settings

logger = logging.getLogger(__name__)

PINATA_UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"

_PLACEHOLDER_PREFIXES = {"your_", "hf_..."}


def _pinata_configured() -> bool:
    """Return True only if real (non-placeholder) Pinata credentials exist."""
    settings = get_settings()
    jwt = (settings.pinata_jwt or "").strip()
    api_key = (settings.pinata_api_key or "").strip()
    if jwt and not any(jwt.startswith(p) for p in _PLACEHOLDER_PREFIXES):
        return True
    if api_key and not any(api_key.startswith(p) for p in _PLACEHOLDER_PREFIXES):
        return True
    return False


def _mock_cid(data: bytes) -> str:
    """Generate a deterministic mock IPFS CID (Qm... style) from file bytes."""
    digest = hashlib.sha256(data).hexdigest()
    # Base58-ish: use first 44 hex chars encoded to look like a CID
    fake_cid = "Qm" + base64.b32encode(bytes.fromhex(digest[:40])).decode().rstrip("=")[:42]
    return fake_cid


def _get_fernet() -> Fernet:
    settings = get_settings()
    key = settings.encryption_key
    if not key:
        # Generate a fresh key for development — production must provide one
        key = base64.urlsafe_b64encode(os.urandom(32)).decode()
    # Fernet expects a URL-safe base64-encoded 32-byte key
    raw = base64.urlsafe_b64decode(key.encode())
    fernet_key = base64.urlsafe_b64encode(raw)
    return Fernet(fernet_key)


def encrypt_bytes(data: bytes) -> bytes:
    """Encrypt file bytes using Fernet (AES-256-GCM). Returns ciphertext."""
    return _get_fernet().encrypt(data)


def decrypt_bytes(ciphertext: bytes) -> bytes:
    """Decrypt Fernet ciphertext back to plaintext bytes."""
    return _get_fernet().decrypt(ciphertext)


def _pinata_headers() -> dict:
    settings = get_settings()
    jwt = (settings.pinata_jwt or "").strip()
    if jwt and not any(jwt.startswith(p) for p in _PLACEHOLDER_PREFIXES):
        return {"Authorization": f"Bearer {jwt}"}
    return {
        "pinata_api_key": settings.pinata_api_key,
        "pinata_secret_api_key": settings.pinata_secret_api_key,
    }


async def upload_encrypted_file(file_bytes: bytes, filename: str) -> str:
    """
    Encrypt ``file_bytes`` and pin the ciphertext to IPFS via Pinata.
    Returns the IPFS CID (e.g. "QmXxx...").

    Retries up to 3 times on network/DNS errors. Falls back to a
    deterministic mock CID when credentials are absent.
    """
    ciphertext = encrypt_bytes(file_bytes)

    if not _pinata_configured():
        mock_cid = _mock_cid(ciphertext)
        logger.warning(
            "Pinata credentials not configured — using mock CID for development: %s",
            mock_cid,
        )
        return mock_cid

    last_exc: Exception = RuntimeError("upload did not run")
    for attempt in range(1, 4):  # up to 3 attempts
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    PINATA_UPLOAD_URL,
                    headers=_pinata_headers(),
                    files={"file": (filename, ciphertext, "application/octet-stream")},
                )
                if not resp.is_success:
                    logger.error(
                        "Pinata upload failed (%s): %s", resp.status_code, resp.text[:300]
                    )
                    resp.raise_for_status()
                return resp.json()["IpfsHash"]
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Pinata returned {exc.response.status_code}: {exc.response.text[:200]}"
            ) from exc
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            last_exc = exc
            logger.warning("Pinata attempt %d/3 failed (%s) — retrying…", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(attempt * 1.5)  # 1.5s, 3s backoff

    # All retries exhausted
    settings = get_settings()
    if settings.env == "development":
        mock_cid = _mock_cid(ciphertext)
        logger.warning(
            "Pinata unreachable after 3 attempts — using mock CID in dev mode: %s",
            mock_cid,
        )
        return mock_cid

    raise RuntimeError(f"Pinata unreachable after 3 attempts: {last_exc}") from last_exc


async def upload_json_to_ipfs(data: dict) -> str:
    """
    Pin a JSON object to IPFS via Pinata.
    Returns the IPFS CID.

    Falls back to a mock CID in development when credentials are absent.
    """
    import json as _json

    if not _pinata_configured():
        mock_cid = _mock_cid(_json.dumps(data).encode())
        logger.warning("Pinata not configured — mock CID for JSON: %s", mock_cid)
        return mock_cid

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                PINATA_JSON_URL,
                headers={**_pinata_headers(), "Content-Type": "application/json"},
                json={"pinataContent": data, "pinataMetadata": {"name": "stackscare-record"}},
            )
            if not resp.is_success:
                logger.error(
                    "Pinata JSON upload failed (%s): %s", resp.status_code, resp.text[:300]
                )
                resp.raise_for_status()
            return resp.json()["IpfsHash"]
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"Pinata returned {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc


async def fetch_from_ipfs(cid: str) -> bytes:
    """Fetch raw bytes from the public IPFS gateway."""
    gateway = f"https://gateway.pinata.cloud/ipfs/{cid}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(gateway)
        resp.raise_for_status()
        return resp.content
