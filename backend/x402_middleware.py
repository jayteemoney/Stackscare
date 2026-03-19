"""
x402 Payment Protocol Middleware for StacksCare (Stacks-native).

Implements the x402 open standard on Stacks to enable pay-per-use
micropayments for AI analysis and molbot service endpoints.

Flow:
  1. Client sends request without payment
  2. Server returns HTTP 402 with payment-required header (Stacks details)
  3. Client signs a STX transfer with Hiro Wallet
  4. Client retries with payment-signature header containing signed tx
  5. Server verifies payment → 200 response

Payment: configurable µSTX per endpoint
Network: Stacks Testnet (default) or Mainnet
"""

import logging
from dataclasses import dataclass
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from x402_stacks import (
    build_payment_required,
    decode_payment_signature,
    encode_payment_required,
    verify_payment,
    PaymentReceipt,
)
from config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class RoutePayment:
    """Payment configuration for a single route."""
    price_ustx: int
    token_type: str
    description: str


# Route-specific payment requirements
PAID_ROUTES: dict[str, RoutePayment] = {
    "POST /api/analyze/document": RoutePayment(
        price_ustx=10_000,      # 0.01 STX
        token_type="STX",
        description="AI analysis of uploaded medical document",
    ),
    "POST /api/analyze/symptoms": RoutePayment(
        price_ustx=10_000,      # 0.01 STX
        token_type="STX",
        description="AI analysis of described symptoms",
    ),
    "POST /api/molbot/format": RoutePayment(
        price_ustx=5_000,       # 0.005 STX
        token_type="STX",
        description="Report formatting by Formatter molbot",
    ),
}


class X402StacksMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that gates endpoints behind x402 Stacks payments.

    If a request arrives at a paid route without a valid payment-signature
    header, the middleware returns HTTP 402 with payment requirements.
    """

    async def dispatch(self, request: Request, call_next: Any):
        settings = get_settings()

        # Build route key: "METHOD /path"
        route_key = f"{request.method} {request.url.path}"
        route_config = PAID_ROUTES.get(route_key)

        # Not a paid route — pass through
        if not route_config:
            return await call_next(request)

        # Check for payment-signature header
        payment_header = request.headers.get("payment-signature", "")

        if not payment_header:
            # No payment — return 402 with payment requirements
            payload = build_payment_required(
                route=route_key,
                description=route_config.description,
                price_ustx=route_config.price_ustx,
                token_type=route_config.token_type,
            )
            return JSONResponse(
                status_code=402,
                content=payload,
                headers={
                    "payment-required": encode_payment_required(payload),
                },
            )

        # Verify the payment
        try:
            payment_data = decode_payment_signature(payment_header)
        except ValueError as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid payment-signature: {e}"},
            )

        receipt: PaymentReceipt = await verify_payment(
            payment_data=payment_data,
            expected_recipient=settings.stx_address,
            expected_amount_ustx=route_config.price_ustx,
        )

        if not receipt.valid:
            return JSONResponse(
                status_code=402,
                content={
                    "error": f"Payment verification failed: {receipt.error}",
                    **build_payment_required(
                        route=route_key,
                        description=route_config.description,
                        price_ustx=route_config.price_ustx,
                        token_type=route_config.token_type,
                    ),
                },
            )

        # Payment valid — add receipt info to request state and proceed
        request.state.payment_receipt = {
            "tx_id": receipt.tx_id,
            "sender": receipt.sender,
            "amount_ustx": receipt.amount_ustx,
        }

        response = await call_next(request)

        # Add payment-response header to the response
        response.headers["payment-response"] = f"settled:{receipt.tx_id}"

        return response


def setup_x402_stacks(app: Any) -> bool:
    """
    Attach x402 Stacks payment middleware to the FastAPI app.
    Returns True if successfully configured.
    """
    settings = get_settings()

    if not settings.stx_address:
        logger.warning("x402 disabled — no STX_ADDRESS configured")
        return False

    app.add_middleware(X402StacksMiddleware)
    logger.info(
        f"x402 Stacks active — paid endpoints require STX payment "
        f"on {settings.stacks_network} → {settings.stx_address}"
    )
    for route, config in PAID_ROUTES.items():
        logger.info(f"  {route}: {config.price_ustx} µSTX ({config.token_type})")
    return True
