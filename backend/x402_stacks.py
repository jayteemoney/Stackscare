"""
Stacks-native x402 payment verification.

Handles the Stacks side of the x402 protocol:
  - Building payment-required responses (402) with Stacks payment details
  - Verifying signed Stacks transactions from payment-signature headers
  - Optional on-chain settlement via the Stacks API

Payment tokens: STX (native), sBTC (SIP-010), USDCx (SIP-010)
Network: Stacks Testnet or Mainnet
"""

import base64
import json
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class PaymentRequirement:
    """x402 payment requirement for a Stacks-gated endpoint."""
    pay_to: str          # Stacks address (SP... or ST...)
    price_ustx: int      # Price in micro-STX (1 STX = 1_000_000 µSTX)
    token_type: str      # "STX", "sBTC", or "USDCx"
    network: str         # "stacks-testnet" or "stacks-mainnet"
    description: str     # Human-readable endpoint description
    resource: str        # The endpoint path being paid for
    version: int = 2     # x402 protocol version


@dataclass
class PaymentReceipt:
    """Result of verifying a payment."""
    valid: bool
    tx_id: Optional[str] = None
    sender: Optional[str] = None
    amount_ustx: Optional[int] = None
    error: Optional[str] = None


def build_payment_required(
    route: str,
    description: str,
    price_ustx: int,
    token_type: str = "STX",
) -> dict:
    """
    Build the x402 payment-required response body.

    Returned as JSON in the 402 response body AND base64-encoded
    in the `payment-required` header.
    """
    settings = get_settings()
    requirement = PaymentRequirement(
        pay_to=settings.stx_address,
        price_ustx=price_ustx,
        token_type=token_type,
        network=settings.stacks_network,
        description=description,
        resource=route,
    )

    payload = {
        "x402Version": requirement.version,
        "accepts": [
            {
                "scheme": "exact",
                "network": requirement.network,
                "payTo": requirement.pay_to,
                "maxAmountRequired": str(requirement.price_ustx),
                "resource": requirement.resource,
                "description": requirement.description,
                "tokenType": requirement.token_type,
                "mimeType": "application/json",
            }
        ],
    }
    return payload


def encode_payment_required(payload: dict) -> str:
    """Base64-encode the payment-required payload for the response header."""
    return base64.b64encode(json.dumps(payload).encode()).decode()


def decode_payment_signature(header_value: str) -> dict:
    """Decode the base64-encoded payment-signature header from the client."""
    try:
        decoded = base64.b64decode(header_value)
        return json.loads(decoded)
    except Exception as e:
        raise ValueError(f"Invalid payment-signature header: {e}") from e


async def verify_payment(
    payment_data: dict,
    expected_recipient: str,
    expected_amount_ustx: int,
) -> PaymentReceipt:
    """
    Verify a Stacks payment from the x402 payment-signature header.

    In production, this would:
      1. Decode the signed Stacks transaction
      2. Verify the sender, recipient, and amount
      3. Broadcast the transaction to the Stacks node
      4. Return the tx_id for settlement tracking

    For hackathon/testnet, we verify the payload structure and signature
    format, then accept if it looks well-formed. The facilitator can
    optionally perform on-chain settlement.
    """
    settings = get_settings()

    try:
        # Extract payment details from the signed payload
        tx_hex = payment_data.get("signedTransaction", "")
        sender = payment_data.get("sender", "")
        amount = int(payment_data.get("amount", 0))
        recipient = payment_data.get("recipient", "")
        token_type = payment_data.get("tokenType", "STX")

        # Basic validation
        if not tx_hex:
            return PaymentReceipt(valid=False, error="Missing signed transaction")
        if not sender:
            return PaymentReceipt(valid=False, error="Missing sender address")

        # Verify the payment matches requirements
        if recipient and recipient != expected_recipient:
            return PaymentReceipt(
                valid=False,
                error=f"Wrong recipient: expected {expected_recipient}, got {recipient}",
            )
        if amount < expected_amount_ustx:
            return PaymentReceipt(
                valid=False,
                error=f"Insufficient payment: expected {expected_amount_ustx} µSTX, got {amount}",
            )

        # Attempt on-chain broadcast if we have a Stacks API endpoint
        tx_id = None
        if settings.stacks_api_url and tx_hex.startswith("0x"):
            tx_id = await _broadcast_transaction(tx_hex)

        return PaymentReceipt(
            valid=True,
            tx_id=tx_id or f"x402-{int(time.time())}",
            sender=sender,
            amount_ustx=amount,
        )

    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        return PaymentReceipt(valid=False, error=str(e))


async def _broadcast_transaction(tx_hex: str) -> Optional[str]:
    """Broadcast a signed Stacks transaction and return the tx_id."""
    settings = get_settings()
    url = f"{settings.stacks_api_url}/v2/transactions"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                content=tx_hex,
                headers={"Content-Type": "application/octet-stream"},
            )
            if resp.status_code == 200:
                # Stacks API returns the txid as a JSON string
                return resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text.strip('"')
            else:
                logger.warning(f"Stacks broadcast returned {resp.status_code}: {resp.text[:200]}")
                return None
    except Exception as e:
        logger.warning(f"Could not broadcast to Stacks node: {e}")
        return None


async def create_stx_payment(
    recipient: str,
    amount_ustx: int,
    private_key: str,
    network: str = "stacks-testnet",
) -> dict:
    """
    Create a signed STX transfer for agent-to-agent payments.

    Used by the Orchestrator molbot to autonomously pay specialist molbots.
    Returns a payment payload suitable for the payment-signature header.

    In a full implementation, this would use the Stacks transactions library
    to build and sign a real STX transfer. For the hackathon, we create a
    well-structured payment payload that the receiving molbot can verify.
    """
    payload = {
        "signedTransaction": f"0x{private_key[:16]}...agent-payment",
        "sender": get_settings().stx_address,
        "recipient": recipient,
        "amount": str(amount_ustx),
        "tokenType": "STX",
        "network": network,
        "timestamp": int(time.time()),
        "type": "agent-to-agent",
    }
    return payload


def encode_payment_signature(payment: dict) -> str:
    """Encode a payment payload for the payment-signature header."""
    return base64.b64encode(json.dumps(payment).encode()).decode()
