"""
StacksCare Backend API — Molbot Commerce Protocol Edition

FastAPI server handling:
  - Encrypted IPFS file upload
  - AI medical document & symptom analysis (Hugging Face / Mistral)
  - Molbot agent registry (on-chain + in-memory)
  - Report formatting specialist molbot
  - Orchestrator molbot (agent-to-agent x402 payments on Stacks)

All AI and molbot service endpoints are gated by x402 Stacks payments:
  - POST /api/analyze/document   → 0.01 STX (MedAnalyzer molbot)
  - POST /api/analyze/symptoms   → 0.01 STX (MedAnalyzer molbot)
  - POST /api/molbot/format      → 0.005 STX (Formatter molbot)

The Orchestrator endpoint (/api/molbot/orchestrate) is free for patients
but internally pays the above molbots via x402, demonstrating true
agent-to-agent commerce on Stacks.
"""

import logging
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_settings
from ipfs_client import upload_encrypted_file, upload_json_to_ipfs
from ai_analyzer import analyze_document, analyze_symptoms
from x402_middleware import setup_x402_stacks
from molbot_registry import registry
from molbot_formatter import format_analysis
from molbot_orchestrator import orchestrate_symptoms, orchestrate_document, result_to_api_response

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="StacksCare Molbot Commerce API",
    description=(
        "Programmable health data ownership + molbot-to-molbot commerce "
        "on Stacks using x402 micropayments"
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_x402(target_app: FastAPI, app_settings):
    """Initialize x402 payment protocol if enabled."""
    if app_settings.x402_active:
        x402_enabled = setup_x402_stacks(target_app)
        if x402_enabled:
            logger.info("x402 Stacks payment protocol active for AI & molbot endpoints")
        else:
            logger.warning("x402 setup failed — endpoints open (no payment required)")
    else:
        logger.info("x402 disabled (set STX_ADDRESS + X402_ENABLED=true to enable)")


# Initialize x402
init_x402(app, settings)

# ===========================
# SCHEMAS
# ===========================


class SymptomsRequest(BaseModel):
    symptoms: str


class FormatRequest(BaseModel):
    raw_analysis: str


class UploadResponse(BaseModel):
    success: bool
    ipfs_hash: str
    message: str


class AnalysisResponse(BaseModel):
    success: bool
    analysis: str
    model: str | None = None


class OrchestrateRequest(BaseModel):
    symptoms: str


# ===========================
# CORE ROUTES
# ===========================


@app.get("/")
async def root():
    return {
        "name": "StacksCare Molbot Commerce API",
        "version": "2.0.0",
        "description": "Molbot-to-molbot commerce on Stacks using x402",
        "protocol": {
            "x402": True,
            "network": settings.stacks_network,
            "paymentToken": "STX",
        },
        "endpoints": {
            "upload_record": "POST /api/upload",
            "analyze_document": "POST /api/analyze/document (x402: 0.01 STX)",
            "analyze_symptoms": "POST /api/analyze/symptoms (x402: 0.01 STX)",
            "orchestrate": "POST /api/molbot/orchestrate (agent-to-agent)",
            "format_report": "POST /api/molbot/format (x402: 0.005 STX)",
            "registry": "GET /api/molbot/registry",
        },
    }


@app.get("/api/health")
async def health():
    return {"status": "healthy", "service": "stackscare-molbot-commerce"}


# ===========================
# IPFS UPLOAD (unchanged)
# ===========================


@app.post("/api/upload", response_model=UploadResponse)
async def upload_record(
    file: UploadFile = File(...),
    record_type: str = Form(default="other"),
):
    """
    Encrypt a medical file and pin it to IPFS via Pinata.
    Returns the IPFS CID to be stored in the Clarity contract.
    Not x402-gated — uploading is free.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed_types = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{content_type}' not supported. Allowed: PDF, JPEG, PNG, TXT, DOC.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit.")

    try:
        cid = await upload_encrypted_file(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"IPFS upload failed: {exc}") from exc

    return UploadResponse(
        success=True,
        ipfs_hash=cid,
        message=f"File encrypted and pinned to IPFS as {cid}",
    )


# ===========================
# AI ANALYSIS ENDPOINTS (x402-gated)
# ===========================


@app.post("/api/analyze/document", response_model=AnalysisResponse)
async def analyze_document_endpoint(
    file: UploadFile = File(...),
):
    """
    MedAnalyzer Molbot — AI analysis of uploaded medical document.
    x402-gated: requires 0.01 STX payment on Stacks.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit.")

    try:
        result = await analyze_document(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    if not result["success"]:
        raise HTTPException(status_code=422, detail=result.get("error", "Analysis failed"))

    return AnalysisResponse(
        success=True,
        analysis=result["analysis"],
        model=result.get("model"),
    )


@app.post("/api/analyze/symptoms", response_model=AnalysisResponse)
async def analyze_symptoms_endpoint(body: SymptomsRequest):
    """
    MedAnalyzer Molbot — AI symptom analysis.
    x402-gated: requires 0.01 STX payment on Stacks.
    """
    try:
        result = await analyze_symptoms(body.symptoms)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    if not result["success"]:
        raise HTTPException(status_code=422, detail=result.get("error", "Analysis failed"))

    return AnalysisResponse(
        success=True,
        analysis=result["analysis"],
        model=result.get("model"),
    )


# ===========================
# MOLBOT COMMERCE ENDPOINTS
# ===========================


@app.get("/api/molbot/registry")
async def get_molbot_registry():
    """
    List all registered molbot agents.
    Reads from on-chain registry (with in-memory seed fallback).
    """
    return {
        "agents": registry.to_dict_list(),
        "count": len(registry.list_agents()),
        "network": settings.stacks_network,
    }


@app.get("/api/molbot/registry/{service_type}")
async def discover_molbot(service_type: str):
    """Discover a molbot by service type (e.g. 'medical-ai', 'report-formatter')."""
    agents = registry.discover_all(service_type)
    if not agents:
        raise HTTPException(status_code=404, detail=f"No active molbot found for '{service_type}'")
    return {
        "agents": [
            {
                "agentId": a.agent_id,
                "name": a.name,
                "endpointUrl": a.endpoint_url,
                "serviceType": a.service_type,
                "priceUstx": a.price_ustx,
                "tokenType": a.token_type,
            }
            for a in agents
        ],
    }


@app.post("/api/molbot/format")
async def format_report_endpoint(body: FormatRequest):
    """
    ReportFormatter Molbot — Format raw AI analysis into structured report.
    x402-gated: requires 0.005 STX payment on Stacks.
    Other molbots pay this endpoint for its specialized formatting service.
    """
    if not body.raw_analysis or len(body.raw_analysis.strip()) < 10:
        raise HTTPException(status_code=400, detail="raw_analysis must be at least 10 characters")

    formatted = format_analysis(body.raw_analysis)
    return {"success": True, "formatted": formatted}


@app.post("/api/molbot/orchestrate")
async def orchestrate_endpoint(body: OrchestrateRequest):
    """
    Orchestrator Molbot — Agent-to-agent commerce entry point.

    Receives a patient's symptom description, then:
      1. Discovers MedAnalyzer via registry
      2. Pays MedAnalyzer 0.01 STX via x402 → gets raw analysis
      3. Discovers ReportFormatter via registry
      4. Pays ReportFormatter 0.005 STX via x402 → gets structured report
      5. Returns aggregated result with full payment trail

    This endpoint is NOT x402-gated itself — the patient calls it
    for free, but the Orchestrator pays specialist molbots internally.
    """
    if not body.symptoms or len(body.symptoms.strip()) < 5:
        raise HTTPException(status_code=400, detail="Please describe symptoms (min 5 chars)")

    try:
        result = await orchestrate_symptoms(body.symptoms)
    except Exception as exc:
        logger.error(f"Orchestration failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Orchestration failed: {exc}") from exc

    if not result.success:
        raise HTTPException(status_code=502, detail=result.error or "Orchestration failed")

    return result_to_api_response(result)


@app.post("/api/molbot/orchestrate/document")
async def orchestrate_document_endpoint(
    file: UploadFile = File(...),
):
    """
    Orchestrator Molbot — Document analysis with agent-to-agent payments.
    Same flow as symptom orchestration but accepts a file upload.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit.")

    try:
        result = await orchestrate_document(file_bytes, file.filename)
    except Exception as exc:
        logger.error(f"Document orchestration failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Orchestration failed: {exc}") from exc

    if not result.success:
        raise HTTPException(status_code=502, detail=result.error or "Orchestration failed")

    return result_to_api_response(result)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
