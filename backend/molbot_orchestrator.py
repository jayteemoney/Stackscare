"""
Orchestrator Molbot — The heart of molbot-to-molbot commerce.

Receives a patient request, discovers specialist molbots from the
on-chain registry, autonomously pays each via x402 on Stacks, chains
results, and returns an aggregated report with full payment receipts.

This is the "protocol where molbots pay each other using STX + x402"
that the hackathon bounty is looking for.

Flow:
  Patient → Orchestrator (free or paid)
    → discovers MedAnalyzer via registry
    → pays 0.01 STX via x402 → gets raw AI analysis
    → discovers ReportFormatter via registry
    → pays 0.005 STX via x402 → gets structured report
    → returns aggregated result + payment trail
"""

import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

from config import get_settings
from molbot_registry import registry, MolbotAgent
from x402_stacks import (
    create_stx_payment,
    decode_payment_signature,
    encode_payment_signature,
)

logger = logging.getLogger(__name__)


@dataclass
class PaymentStep:
    """One payment transaction in the orchestration chain."""
    molbot_name: str
    service_type: str
    endpoint: str
    amount_ustx: int
    token_type: str
    tx_id: Optional[str] = None
    status: str = "pending"
    duration_ms: Optional[int] = None


@dataclass
class OrchestrationResult:
    """Full result of an orchestration run."""
    success: bool
    raw_analysis: Optional[str] = None
    formatted_report: Optional[dict] = None
    payment_trail: list[PaymentStep] = None
    total_cost_ustx: int = 0
    error: Optional[str] = None

    def __post_init__(self):
        if self.payment_trail is None:
            self.payment_trail = []


async def orchestrate_symptoms(symptoms: str) -> OrchestrationResult:
    """
    Full orchestration flow for symptom analysis.

    1. Discover MedAnalyzer molbot → pay via x402 → get analysis
    2. Discover ReportFormatter molbot → pay via x402 → get formatted report
    3. Return aggregated result with payment trail
    """
    settings = get_settings()
    result = OrchestrationResult(success=False)

    try:
        # --- Step 1: Discover and call MedAnalyzer ---
        analyzer = registry.discover("medical-ai")
        if not analyzer:
            result.error = "No medical-ai molbot found in registry"
            return result

        logger.info(f"Orchestrator → calling {analyzer.name} at {analyzer.endpoint_url}")

        analysis_step = PaymentStep(
            molbot_name=analyzer.name,
            service_type=analyzer.service_type,
            endpoint=analyzer.endpoint_url,
            amount_ustx=analyzer.price_ustx,
            token_type=analyzer.token_type,
        )

        raw_analysis = await _call_molbot_with_x402_payment(
            endpoint=analyzer.endpoint_url,
            payload={"symptoms": symptoms},
            price_ustx=analyzer.price_ustx,
            step=analysis_step,
        )
        result.payment_trail.append(analysis_step)
        if not raw_analysis:
            result.error = f"MedAnalyzer call failed: {analysis_step.status}"
            return result
        result.raw_analysis = raw_analysis

        # --- Step 2: Discover and call ReportFormatter ---
        formatter = registry.discover("report-formatter")
        if not formatter:
            # No formatter available — return raw analysis
            logger.info("No report-formatter found — returning raw analysis")
            result.success = True
            result.total_cost_ustx = sum(s.amount_ustx for s in result.payment_trail if s.status in ("paid", "free"))
            return result

        logger.info(f"Orchestrator → calling {formatter.name} at {formatter.endpoint_url}")

        format_step = PaymentStep(
            molbot_name=formatter.name,
            service_type=formatter.service_type,
            endpoint=formatter.endpoint_url,
            amount_ustx=formatter.price_ustx,
            token_type=formatter.token_type,
        )

        formatted = await _call_molbot_with_x402_payment(
            endpoint=formatter.endpoint_url,
            payload={"raw_analysis": raw_analysis},
            price_ustx=formatter.price_ustx,
            step=format_step,
        )

        result.payment_trail.append(format_step)

        if formatted:
            import json
            try:
                result.formatted_report = json.loads(formatted) if isinstance(formatted, str) else formatted
            except (json.JSONDecodeError, TypeError):
                result.formatted_report = {"raw": formatted}

        result.success = True
        result.total_cost_ustx = sum(
            s.amount_ustx for s in result.payment_trail if s.status in ("paid", "free")
        )

        logger.info(
            f"Orchestration complete — {len(result.payment_trail)} payments, "
            f"total cost: {result.total_cost_ustx} µSTX"
        )

    except Exception as e:
        logger.error(f"Symptom orchestration failed: {e}")
        result.error = str(e)
        result.success = False

    return result


async def orchestrate_document(file_bytes: bytes, filename: str) -> OrchestrationResult:
    """
    Full orchestration flow for document analysis.
    Similar to symptoms but sends a file to the document analyzer.
    """
    settings = get_settings()
    result = OrchestrationResult(success=False)

    try:
        analyzer = registry.discover("medical-ai-document")
        if not analyzer:
            # Fall back to symptom analyzer endpoint
            analyzer = registry.discover("medical-ai")
        if not analyzer:
            result.error = "No medical-ai molbot found in registry"
            return result

        analysis_step = PaymentStep(
            molbot_name=analyzer.name,
            service_type=analyzer.service_type,
            endpoint=analyzer.endpoint_url,
            amount_ustx=analyzer.price_ustx,
            token_type=analyzer.token_type,
        )

        raw_analysis = await _call_molbot_document_with_x402(
            endpoint=analyzer.endpoint_url,
            file_bytes=file_bytes,
            filename=filename,
            price_ustx=analyzer.price_ustx,
            step=analysis_step,
        )

        result.payment_trail.append(analysis_step)

        if not raw_analysis:
            result.error = f"Document analyzer call failed: {analysis_step.status}"
            return result

        result.raw_analysis = raw_analysis

        # Format the result
        formatter = registry.discover("report-formatter")
        if formatter:
            format_step = PaymentStep(
                molbot_name=formatter.name,
                service_type=formatter.service_type,
                endpoint=formatter.endpoint_url,
                amount_ustx=formatter.price_ustx,
                token_type=formatter.token_type,
            )

            formatted = await _call_molbot_with_x402_payment(
                endpoint=formatter.endpoint_url,
                payload={"raw_analysis": raw_analysis},
                price_ustx=formatter.price_ustx,
                step=format_step,
            )
            result.payment_trail.append(format_step)

            if formatted:
                import json
                try:
                    result.formatted_report = json.loads(formatted) if isinstance(formatted, str) else formatted
                except (json.JSONDecodeError, TypeError):
                    result.formatted_report = {"raw": formatted}

        result.success = True
        result.total_cost_ustx = sum(
            s.amount_ustx for s in result.payment_trail if s.status in ("paid", "free")
        )
    except Exception as e:
        logger.error(f"Document orchestration failed: {e}")
        result.success = False
        result.error = str(e)

    return result


async def _call_molbot_with_x402_payment(
    endpoint: str,
    payload: dict,
    price_ustx: int,
    step: PaymentStep,
) -> Optional[str]:
    """
    Call a molbot endpoint with automatic x402 payment handling.

    This is agent-to-agent commerce in action:
      1. Send request → get 402
      2. Sign STX payment → retry with payment-signature header
      3. Receive result
    """
    settings = get_settings()
    start = time.time()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # --- First attempt: expect 402 ---
            resp = await client.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if resp.status_code == 402:
                logger.info(f"  → Received 402 from {step.molbot_name}, creating payment...")

                # Create a signed STX payment
                payment = await create_stx_payment(
                    recipient=settings.stx_address,
                    amount_ustx=price_ustx,
                    private_key=settings.stx_private_key,
                    network=settings.stacks_network,
                )
                payment_header = encode_payment_signature(payment)

                # --- Retry with payment ---
                resp = await client.post(
                    endpoint,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "payment-signature": payment_header,
                    },
                )

                if resp.status_code == 200:
                    step.status = "paid"
                    step.tx_id = resp.headers.get("payment-response", "").replace("settled:", "")
                    step.duration_ms = int((time.time() - start) * 1000)
                    data = resp.json()
                    return data.get("analysis", data.get("formatted", str(data)))
                else:
                    step.status = f"failed-{resp.status_code}"
                    logger.error(f"  → Payment rejected by {step.molbot_name}: {resp.text[:200]}")
                    return None

            elif resp.status_code == 200:
                # Endpoint didn't require payment (dev mode)
                step.status = "free"
                step.duration_ms = int((time.time() - start) * 1000)
                data = resp.json()
                return data.get("analysis", data.get("formatted", str(data)))

            else:
                step.status = f"error-{resp.status_code}"
                return None

    except Exception as e:
        step.status = f"error: {e}"
        logger.error(f"  → Failed to call {step.molbot_name}: {e}")
        return None


async def _call_molbot_document_with_x402(
    endpoint: str,
    file_bytes: bytes,
    filename: str,
    price_ustx: int,
    step: PaymentStep,
) -> Optional[str]:
    """Call a document analysis molbot with x402 payment (multipart upload)."""
    settings = get_settings()
    start = time.time()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            files = {"file": (filename, file_bytes, "application/octet-stream")}

            resp = await client.post(endpoint, files=files)

            if resp.status_code == 402:
                payment = await create_stx_payment(
                    recipient=settings.stx_address,
                    amount_ustx=price_ustx,
                    private_key=settings.stx_private_key,
                    network=settings.stacks_network,
                )
                payment_header = encode_payment_signature(payment)

                resp = await client.post(
                    endpoint,
                    files={"file": (filename, file_bytes, "application/octet-stream")},
                    headers={"payment-signature": payment_header},
                )

                if resp.status_code == 200:
                    step.status = "paid"
                    step.tx_id = resp.headers.get("payment-response", "").replace("settled:", "")
                    step.duration_ms = int((time.time() - start) * 1000)
                    data = resp.json()
                    return data.get("analysis", str(data))

            elif resp.status_code == 200:
                step.status = "free"
                step.duration_ms = int((time.time() - start) * 1000)
                data = resp.json()
                return data.get("analysis", str(data))

            step.status = f"error-{resp.status_code}"
            return None

    except Exception as e:
        step.status = f"error: {e}"
        logger.error(f"  → Failed to call document analyzer: {e}")
        return None


def result_to_api_response(result: OrchestrationResult) -> dict:
    """Convert OrchestrationResult to a JSON-serializable API response."""
    return {
        "success": result.success,
        "rawAnalysis": result.raw_analysis,
        "formattedReport": result.formatted_report,
        "paymentTrail": [
            {
                "molbotName": s.molbot_name,
                "serviceType": s.service_type,
                "endpoint": s.endpoint,
                "amountUstx": s.amount_ustx,
                "tokenType": s.token_type,
                "txId": s.tx_id,
                "status": s.status,
                "durationMs": s.duration_ms,
            }
            for s in result.payment_trail
        ],
        "totalCostUstx": result.total_cost_ustx,
        "error": result.error,
    }
