"""
IPFS client using Pinata.
Docs: https://docs.pinata.cloud/api-reference/endpoint/upload-a-file

Encryption is done with AES-256-GCM (Fernet) before upload so the data
stored on IPFS is always ciphertext — the decryption key never leaves
the patient's custody.
"""

import base64
import os
import httpx
from cryptography.fernet import Fernet
from config import get_settings

PINATA_UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


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
    if settings.pinata_jwt:
        return {"Authorization": f"Bearer {settings.pinata_jwt}"}
    return {
        "pinata_api_key": settings.pinata_api_key,
        "pinata_secret_api_key": settings.pinata_secret_api_key,
    }


async def upload_encrypted_file(file_bytes: bytes, filename: str) -> str:
    """
    Encrypt ``file_bytes`` and pin the ciphertext to IPFS via Pinata.
    Returns the IPFS CID (e.g. "QmXxx...").
    """
    ciphertext = encrypt_bytes(file_bytes)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            PINATA_UPLOAD_URL,
            headers=_pinata_headers(),
            files={"file": (filename, ciphertext, "application/octet-stream")},
        )
        resp.raise_for_status()
        return resp.json()["IpfsHash"]


async def upload_json_to_ipfs(data: dict) -> str:
    """
    Pin a JSON object to IPFS via Pinata.
    Returns the IPFS CID.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            PINATA_JSON_URL,
            headers={**_pinata_headers(), "Content-Type": "application/json"},
            json={"pinataContent": data, "pinataMetadata": {"name": "stackscare-record"}},
        )
        resp.raise_for_status()
        return resp.json()["IpfsHash"]


async def fetch_from_ipfs(cid: str) -> bytes:
    """Fetch raw bytes from the public IPFS gateway."""
    gateway = f"https://gateway.pinata.cloud/ipfs/{cid}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(gateway)
        resp.raise_for_status()
        return resp.content
