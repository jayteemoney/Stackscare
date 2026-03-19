import pytest
import io
import json
import base64
import os
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import Response, HTTPStatusError
import respx

from ai_analyzer import (
    analyze_document,
    analyze_symptoms,
    extract_text_from_pdf,
    _query_hf
)
from ipfs_client import (
    encrypt_bytes,
    decrypt_bytes,
    upload_encrypted_file,
    upload_json_to_ipfs,
    fetch_from_ipfs,
    _get_fernet
)
from molbot_registry import registry, MolbotAgent
from molbot_orchestrator import (
    orchestrate_symptoms,
    orchestrate_document,
    _call_molbot_with_x402_payment,
    _call_molbot_document_with_x402,
    PaymentStep,
    OrchestrationResult,
    result_to_api_response
)
from x402_middleware import X402StacksMiddleware, RoutePayment
from starlette.requests import Request
from starlette.responses import JSONResponse

# --- ai_analyzer.py tests ---

@pytest.mark.asyncio
async def test_query_hf_non_list_response():
    with respx.mock:
        respx.post("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3").mock(
            return_value=Response(200, json={"error": "some error"})
        )
        result = await _query_hf("test prompt")
        assert "{'error': 'some error'}" in result

@pytest.mark.asyncio
async def test_analyze_document_empty_content():
    # Empty PDF or empty text
    result = await analyze_document(b"", "test.txt")
    assert result["success"] is False
    assert "Could not extract readable text" in result["error"]

@pytest.mark.asyncio
async def test_analyze_document_non_pdf():
    with respx.mock:
        respx.post("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3").mock(
            return_value=Response(200, json=[{"generated_text": "AI Analysis"}])
        )
        result = await analyze_document(b"plain text", "test.txt")
        assert result["success"] is True
        assert result["analysis"] == "AI Analysis"

@pytest.mark.asyncio
async def test_analyze_document_exception():
    with patch("ai_analyzer._query_hf", side_effect=Exception("HF Failed")):
        result = await analyze_document(b"some data", "test.txt")
        assert result["success"] is False
        assert result["error"] == "HF Failed"

@pytest.mark.asyncio
async def test_analyze_symptoms_short_input():
    result = await analyze_symptoms("abc")
    assert result["success"] is False
    assert "detail" in result["error"]

@pytest.mark.asyncio
async def test_analyze_symptoms_exception():
    with patch("ai_analyzer._query_hf", side_effect=Exception("HF Failed")):
        result = await analyze_symptoms("persistent headache for days")
        assert result["success"] is False
        assert result["error"] == "HF Failed"

# --- ipfs_client.py tests ---

def test_get_fernet_new_key():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.encryption_key = ""
        f = _get_fernet()
        assert f is not None

def test_encrypt_decrypt_cycle():
    data = b"secret health data"
    encrypted = encrypt_bytes(data)
    decrypted = decrypt_bytes(encrypted)
    assert decrypted == data

@pytest.mark.asyncio
async def test_upload_encrypted_file_no_jwt():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.pinata_jwt = ""
        mock_settings.return_value.pinata_api_key = "key"
        mock_settings.return_value.pinata_secret_api_key = "secret"
        
        with respx.mock:
            respx.post("https://api.pinata.cloud/pinning/pinFileToIPFS").mock(
                return_value=Response(200, json={"IpfsHash": "Qm123"})
            )
            cid = await upload_encrypted_file(b"data", "file.txt")
            assert cid == "Qm123"

@pytest.mark.asyncio
async def test_upload_json_to_ipfs():
    with respx.mock:
        respx.post("https://api.pinata.cloud/pinning/pinJSONToIPFS").mock(
            return_value=Response(200, json={"IpfsHash": "QmJson"})
        )
        cid = await upload_json_to_ipfs({"test": "data"})
        assert cid == "QmJson"

@pytest.mark.asyncio
async def test_fetch_from_ipfs():
    with respx.mock:
        respx.get("https://gateway.pinata.cloud/ipfs/QmCID").mock(
            return_value=Response(200, content=b"ipfs data")
        )
        data = await fetch_from_ipfs("QmCID")
        assert data == b"ipfs data"

# --- molbot_registry.py tests ---

@pytest.mark.asyncio
async def test_registry_refresh_from_chain_no_url():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = ""
        success = await registry.refresh_from_chain()
        assert success is False

@pytest.mark.asyncio
async def test_registry_read_agent_count_fail():
    with respx.mock:
        respx.post(url__regex=r".*/get-agent-count").mock(
            return_value=Response(500)
        )
        with pytest.raises(HTTPStatusError):
            await registry._read_agent_count()

@pytest.mark.asyncio
async def test_registry_refresh_from_chain_empty():
    with patch("molbot_registry.MolbotRegistry._read_agent_count", return_value=0):
        success = await registry.refresh_from_chain()
        assert success is False

# --- molbot_formatter.py tests ---

from molbot_formatter import format_analysis

def test_format_analysis_short():
    res = format_analysis("too short")
    assert res["error"] == "Input text too short to format"

def test_format_analysis_full():
    raw = """
**Summary**
This is a summary.

**Key Findings**
- Finding 1
- Finding 2

**Risk Level** Moderate

**Recommendations**
1. Rec 1
2. Rec 2

**Questions for Your Doctor**
* Q1
* Q2
"""
    res = format_analysis(raw)
    assert res["formatted"] is True
    assert res["sectionCount"] >= 5
    titles = [s["title"] for s in res["sections"]]
    assert "Summary" in titles
    assert "Key Findings" in titles
    assert "Risk Level" in titles
    assert "Recommendations" in titles
    assert "Questions for Your Doctor" in titles

def test_format_analysis_symptoms():
    raw = """
**Detected Concerns**
High blood pressure.

**Possible Conditions**
1. Hypertension
2. Stress
"""
    res = format_analysis(raw)
    titles = [s["title"] for s in res["sections"]]
    assert "Detected Concerns" in titles
    assert "Possible Conditions" in titles

def test_format_analysis_no_sections():
    res = format_analysis("This is just some text without bold headers.")
    assert res["sectionCount"] == 2 # Analysis + Disclaimer
    assert res["sections"][0]["title"] == "Analysis"

# --- x402_stacks.py tests ---

from x402_stacks import (
    build_payment_required,
    encode_payment_required,
    decode_payment_signature,
    verify_payment,
    create_stx_payment,
    _broadcast_transaction
)

@pytest.mark.asyncio
async def test_verify_payment_invalid_data():
    res = await verify_payment({}, "target", 1000)
    assert res.valid is False
    assert "Missing signed transaction" in res.error

@pytest.mark.asyncio
async def test_verify_payment_wrong_recipient():
    data = {"signedTransaction": "0x123", "sender": "S1", "amount": 1000, "recipient": "R1"}
    res = await verify_payment(data, "R2", 1000)
    assert res.valid is False
    assert "Wrong recipient" in res.error

@pytest.mark.asyncio
async def test_verify_payment_insufficient_amount():
    data = {"signedTransaction": "0x123", "sender": "S1", "amount": 500, "recipient": "R1"}
    res = await verify_payment(data, "R1", 1000)
    assert res.valid is False
    assert "Insufficient payment" in res.error

@pytest.mark.asyncio
async def test_verify_payment_success_with_broadcast():
    data = {"signedTransaction": "0x123", "sender": "S1", "amount": 1000, "recipient": "R1"}
    with patch("x402_stacks.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = "http://api"
        mock_settings.return_value.stx_address = "R1"
        mock_settings.return_value.stacks_network = "testnet"
        with respx.mock:
            respx.post("http://api/v2/transactions").mock(return_value=Response(200, text='"txid123"'))
            res = await verify_payment(data, "R1", 1000)
            assert res.valid is True
            assert res.tx_id == "txid123"

@pytest.mark.asyncio
async def test_broadcast_transaction_fail():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = "http://api"
        with respx.mock:
            respx.post("http://api/v2/transactions").mock(return_value=Response(500))
            res = await _broadcast_transaction("0x123")
            assert res is None

@pytest.mark.asyncio
async def test_broadcast_transaction_exception():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = "http://api"
        with patch("httpx.AsyncClient.post", side_effect=Exception("Net Error")):
            res = await _broadcast_transaction("0x123")
            assert res is None

# --- molbot_orchestrator.py tests ---

from molbot_orchestrator import (
    orchestrate_symptoms,
    orchestrate_document,
    _call_molbot_with_x402_payment
)

@pytest.mark.asyncio
async def test_orchestrate_symptoms_no_analyzer():
    with patch("molbot_registry.registry.discover", return_value=None):
        res = await orchestrate_symptoms("headache")
        assert res.success is False
        assert "No medical-ai molbot" in res.error

@pytest.mark.asyncio
async def test_orchestrate_symptoms_call_failed():
    agent = MolbotAgent(1, "TestBot", "http://bot", "medical-ai", 1000, "STX")
    with patch("molbot_registry.registry.discover", return_value=agent):
        with patch("molbot_orchestrator._call_molbot_with_x402_payment", return_value=None):
            res = await orchestrate_symptoms("headache")
            assert res.success is False
            assert "MedAnalyzer call failed" in res.error

@pytest.mark.asyncio
async def test_orchestrate_symptoms_no_formatter():
    agent = MolbotAgent(1, "TestBot", "http://bot", "medical-ai", 1000, "STX")
    def side_effect(st):
        if st == "medical-ai": return agent
        return None
        
    with patch("molbot_registry.registry.discover", side_effect=side_effect):
        with patch("molbot_orchestrator._call_molbot_with_x402_payment", return_value="analysis"):
            res = await orchestrate_symptoms("headache")
            assert res.success is True
            assert res.raw_analysis == "analysis"
            assert res.formatted_report is None

@pytest.mark.asyncio
async def test_orchestrate_document_fallback():
    agent = MolbotAgent(1, "FallbackBot", "http://bot", "medical-ai", 1000, "STX")
    def side_effect(st):
        if st == "medical-ai-document": return None
        if st == "medical-ai": return agent
        return None

    with patch("molbot_registry.registry.discover", side_effect=side_effect):
        with patch("molbot_orchestrator._call_molbot_document_with_x402", return_value="analysis"):
            res = await orchestrate_document(b"data", "test.pdf")
            assert res.success is True
            assert res.raw_analysis == "analysis"

@pytest.mark.asyncio
async def test_call_molbot_with_x402_retry_success():
    step = PaymentStep("Bot", "type", "http://bot", 1000, "STX")
    with respx.mock:
        # First call -> 402
        respx.post("http://bot").mock(side_effect=[
            Response(402, json={"payTo": "target"}),
            Response(200, json={"analysis": "fixed analysis"}, headers={"payment-response": "settled:tx123"})
        ])
        
        with patch("config.get_settings") as mock_settings:
            mock_settings.return_value.stx_private_key = "key"
            res = await _call_molbot_with_x402_payment("http://bot", {}, 1000, step)
            assert res == "fixed analysis"
            assert step.status == "paid"
            assert step.tx_id == "tx123"

@pytest.mark.asyncio
async def test_call_molbot_with_x402_retry_fail():
    step = PaymentStep("Bot", "type", "http://bot", 1000, "STX")
    with respx.mock:
        respx.post("http://bot").mock(side_effect=[
            Response(402, json={"payTo": "target"}),
            Response(400, text="Payment Rejected")
        ])
        res = await _call_molbot_with_x402_payment("http://bot", {}, 1000, step)
        assert res is None
        assert step.status == "failed-400"

# --- x402_middleware.py tests ---

from x402_middleware import setup_x402_stacks

@pytest.mark.asyncio
async def test_middleware_invalid_signature():
    app = MagicMock()
    middleware = X402StacksMiddleware(app)
    request = MagicMock(spec=Request)
    request.method = "POST"
    request.url.path = "/api/analyze/symptoms"
    request.headers = {"payment-signature": "invalid-base64"}
    
    response = await middleware.dispatch(request, None)
    assert response.status_code == 400

def test_setup_x402_no_address():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.stx_address = ""
        app = MagicMock()
        res = setup_x402_stacks(app)
        assert res is False
def test_result_to_api_response():
    step = PaymentStep("Bot", "type", "http://bot", 1000, "STX", tx_id="tx1", status="paid", duration_ms=100)
    res = OrchestrationResult(success=True, raw_analysis="raw")
    res.payment_trail = [step]
    res.total_cost_ustx = 1000
    api_res = result_to_api_response(res)
    assert api_res["success"] is True
    assert len(api_res["paymentTrail"]) == 1
    assert api_res["paymentTrail"][0]["txId"] == "tx1"

@pytest.mark.asyncio
async def test_orchestrate_document_success():
    analyzer = MolbotAgent(1, "FallbackBot", "http://bot", "medical-ai", 1000, "STX")
    def side_effect(st):
        if st == "medical-ai-document": return analyzer
        return None
    with patch("molbot_registry.registry.discover", side_effect=side_effect):
        with patch("molbot_orchestrator._call_molbot_document_with_x402", return_value="analysis"):
            res = await orchestrate_document(b"data", "test.pdf")
            assert res.success is True

@pytest.mark.asyncio
async def test_call_molbot_document_with_x402_success():
    step = PaymentStep("Bot", "type", "http://bot", 1000, "STX")
    with respx.mock:
        respx.post("http://bot").mock(return_value=Response(200, json={"analysis": "doc analysis"}))
        res = await _call_molbot_document_with_x402("http://bot", b"data", "test.pdf", 1000, step)
        assert res == "doc analysis"
        assert step.status == "free"

@pytest.mark.asyncio
async def test_registry_refresh_from_chain_success():
    with patch("config.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = "http://api"
        mock_settings.return_value.registry_contract_address = "ADDR"
        with patch("molbot_registry.MolbotRegistry._read_agent_count", return_value=1):
            with patch("molbot_registry.MolbotRegistry._read_agent", return_value=MolbotAgent(1, "N", "E", "S", 1000, "STX")):
                success = await registry.refresh_from_chain()
                assert success is True
                assert len(registry._agents) == 1

@pytest.mark.asyncio
async def test_middleware_success_path():
    app = MagicMock()
    async def call_next(req):
        return Response(200)
    
    middleware = X402StacksMiddleware(app)
    request = MagicMock(spec=Request)
    request.method = "POST"
    request.url.path = "/api/analyze/symptoms"
    
    # Mock verify_payment to return valid receipt
    from x402_stacks import PaymentReceipt
    receipt = PaymentReceipt(valid=True, tx_id="tx123", sender="S1", amount_ustx=10000)
    
    with patch("x402_middleware.decode_payment_signature", return_value={}):
        with patch("x402_middleware.verify_payment", return_value=receipt):
            request.headers = {"payment-signature": "valid-sig"}
            response = await middleware.dispatch(request, call_next)
            assert response.status_code == 200
            assert response.headers["payment-response"] == "settled:tx123"

@pytest.mark.asyncio
async def test_middleware_verification_fail():
    app = MagicMock()
    middleware = X402StacksMiddleware(app)
    request = MagicMock(spec=Request)
    request.method = "POST"
    request.url.path = "/api/analyze/symptoms"
    
    from x402_stacks import PaymentReceipt
    receipt = PaymentReceipt(valid=False, error="Invalid TX")
    
    with patch("x402_middleware.decode_payment_signature", return_value={}):
        with patch("x402_middleware.verify_payment", return_value=receipt):
            request.headers = {"payment-signature": "valid-sig"}
            response = await middleware.dispatch(request, None)
            assert response.status_code == 402
            assert b"verification failed" in response.body

def test_x402_stacks_encoding():
    payload = build_payment_required("/api", "desc", 1000)
    encoded = encode_payment_required(payload)
    assert encoded is not None
    decoded = decode_payment_signature(encoded)
    assert decoded["x402Version"] == 2

def test_setup_x402_stacks_success():
    with patch("x402_middleware.get_settings") as mock_settings:
        mock_settings.return_value.stx_address = "ADDR"
        app = MagicMock()
        res = setup_x402_stacks(app)
        assert res is True
        app.add_middleware.assert_called()

# --- main.py tests ---
from fastapi import HTTPException
from fastapi.testclient import TestClient
from main import app

def test_main_root():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200

def test_main_health():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_upload_no_filename():
    client = TestClient(app)
    # sending empty filename
    response = client.post("/api/upload", files={"file": ("", b"data")})
    assert response.status_code in (400, 422)

@pytest.mark.asyncio
async def test_analyze_document_no_filename():
    client = TestClient(app)
    response = client.post("/api/analyze/document", files={"file": ("", b"data")})
    assert response.status_code in (400, 422)

@pytest.mark.asyncio
async def test_main_orchestrate_document_no_file():
    client = TestClient(app)
    response = client.post("/api/molbot/orchestrate/document", files={"file": ("", b"data")})
    assert response.status_code in (400, 422)

# --- main.py error paths & coverage ---

@pytest.mark.asyncio
async def test_main_upload_exception():
    client = TestClient(app)
    with patch("main.upload_encrypted_file", side_effect=Exception("BOOM")):
        response = client.post("/api/upload", files={"file": ("test.pdf", b"data", "application/pdf")})
        assert response.status_code == 502
        assert "IPFS upload failed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_main_analyze_document_exception():
    client = TestClient(app)
    with patch("main.analyze_document", side_effect=Exception("BOOM")):
        response = client.post("/api/analyze/document", files={"file": ("test.pdf", b"data", "application/pdf")})
        assert response.status_code == 502

@pytest.mark.asyncio
async def test_main_analyze_document_fail_result():
    client = TestClient(app)
    with patch("main.analyze_document", return_value={"success": False, "error": "Reason"}):
        response = client.post("/api/analyze/document", files={"file": ("test.pdf", b"data", "application/pdf")})
        assert response.status_code == 422
        assert "Reason" in response.json()["detail"]

@pytest.mark.asyncio
async def test_main_analyze_symptoms_exception():
    client = TestClient(app)
    with patch("main.analyze_symptoms", side_effect=Exception("BOOM")):
        response = client.post("/api/analyze/symptoms", json={"symptoms": "headache and fever"})
        assert response.status_code == 502

@pytest.mark.asyncio
async def test_main_analyze_symptoms_fail_result():
    client = TestClient(app)
    with patch("main.analyze_symptoms", return_value={"success": False, "error": "Reason"}):
        response = client.post("/api/analyze/symptoms", json={"symptoms": "short"})
        assert response.status_code == 422

@pytest.mark.asyncio
async def test_main_orchestrate_fail():
    client = TestClient(app)
    mock_res = OrchestrationResult(success=False, error="Reason")
    with patch("main.orchestrate_symptoms", return_value=mock_res):
        response = client.post("/api/molbot/orchestrate", json={"symptoms": "headache and fever"})
        assert response.status_code == 502

@pytest.mark.asyncio
async def test_main_orchestrate_document_fail():
    client = TestClient(app)
    mock_res = OrchestrationResult(success=False, error="Reason")
    with patch("main.orchestrate_document", return_value=mock_res):
        response = client.post("/api/molbot/orchestrate/document", files={"file": ("test.pdf", b"data")})
        assert response.status_code == 502

@pytest.mark.asyncio
async def test_main_orchestrate_document_no_file():
    client = TestClient(app)
    response = client.post("/api/molbot/orchestrate/document", files={"file": ("", b"data")})
    assert response.status_code in (400, 422)

# --- Orchestrator & Registry depth ---

# --- Final Coverage & Consolidated Fixes ---

@pytest.mark.asyncio
async def test_orchestrate_symptoms_full_chain_final():
    analyzer = MolbotAgent(1, "Analyzer", "http://analyzer", "medical-ai", 1000, "STX")
    formatter = MolbotAgent(2, "Formatter", "http://formatter", "report-formatter", 500, "STX")
    
    with patch("molbot_orchestrator.registry.discover") as mock_disc:
        mock_disc.side_effect = lambda st: analyzer if st == "medical-ai" else formatter if st == "report-formatter" else None
        
        async def mock_call(endpoint, payload, price_ustx, step):
            step.status = "paid"
            if "symptoms" in payload: return "raw analysis"
            return {"formatted": True}

        with patch("molbot_orchestrator._call_molbot_with_x402_payment", side_effect=mock_call):
            res = await orchestrate_symptoms("headache")
            assert res.success is True
            assert res.total_cost_ustx == 1500

@pytest.mark.asyncio
async def test_orchestrate_document_full_chain_final():
    analyzer = MolbotAgent(1, "DocAnalyzer", "http://doc", "medical-ai-document", 1000, "STX")
    formatter = MolbotAgent(2, "Formatter", "http://formatter", "report-formatter", 500, "STX")
    
    with patch("molbot_orchestrator.registry.discover") as mock_disc:
        mock_disc.side_effect = lambda st: analyzer if st == "medical-ai-document" else formatter if st == "report-formatter" else None
        
        async def mock_doc_call(endpoint, file_bytes, filename, price_ustx, step):
            step.status = "paid"
            return "raw analysis"
            
        async def mock_fmt_call(endpoint, payload, price_ustx, step):
            step.status = "paid"
            return {"formatted": True}

        with patch("molbot_orchestrator._call_molbot_document_with_x402", side_effect=mock_doc_call):
            with patch("molbot_orchestrator._call_molbot_with_x402_payment", side_effect=mock_fmt_call):
                res = await orchestrate_document(b"data", "test.pdf")
                assert res.success is True
                assert res.total_cost_ustx == 1500

@pytest.mark.asyncio
async def test_registry_discover_all_final():
    from molbot_registry import registry
    registry._agents = [MolbotAgent(1, "test-agent", "http://test", "medical-ai", 1000, "STX")]
    agents = registry.discover_all("medical-ai")
    assert len(agents) > 0

@pytest.mark.asyncio
async def test_call_molbot_document_with_x402_retry_final():
    step = PaymentStep("Bot", "type", "http://bot", 1000, "STX")
    with respx.mock:
        # We need to mock BOTH posts
        respx.post("http://bot").mock(side_effect=[
            Response(402, json={"payTo": "target"}),
            Response(200, json={"analysis": "fixed analysis"}, headers={"payment-response": "settled:txdoc"})
        ])
        with patch("molbot_orchestrator.get_settings") as mock_settings:
            mock_settings.return_value.stx_private_key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01"
            mock_settings.return_value.stx_address = "S1"
            mock_settings.return_value.stacks_network = "testnet"
            res = await _call_molbot_document_with_x402("http://bot", b"data", "test.pdf", 1000, step)
            assert res == "fixed analysis"
            assert step.status == "paid"

# --- Main API Final Coverage ---

@pytest.mark.asyncio
async def test_main_orchestrate_success_formatted():
    client = TestClient(app)
    mock_res = OrchestrationResult(success=True, raw_analysis="raw")
    mock_res.formatted_report = {"formatted": True}
    with patch("main.orchestrate_symptoms", return_value=mock_res):
        response = client.post("/api/molbot/orchestrate", json={"symptoms": "headache and fever"})
        assert response.status_code == 200
        assert response.json()["formattedReport"]["formatted"] is True

@pytest.mark.asyncio
async def test_main_orchestrate_document_success_formatted():
    client = TestClient(app)
    mock_res = OrchestrationResult(success=True, raw_analysis="raw")
    mock_res.formatted_report = {"formatted": True}
    with patch("main.orchestrate_document", return_value=mock_res):
        response = client.post("/api/molbot/orchestrate/document", files={"file": ("test.pdf", b"data")})
        assert response.status_code == 200
        assert response.json()["formattedReport"]["formatted"] is True

@pytest.mark.asyncio
async def test_registry_get_molbot_not_found():
    client = TestClient(app)
    response = client.get("/api/molbot/registry/nonexistent")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_format_report_success():
    client = TestClient(app)
    # The format_analysis function returns a dict, and the endpoint returns it as-is
    with patch("main.format_analysis", return_value={"formatted": True}):
        response = client.post("/api/molbot/format", json={"raw_analysis": "This is a long enough analysis to format."})
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["formatted"]["formatted"] is True

@pytest.mark.asyncio
async def test_format_report_fail_manual():
    client = TestClient(app)
    with patch("main.format_analysis", return_value={"error": "too short"}):
        response = client.post("/api/molbot/format", json={"raw_analysis": "short"})
        assert response.status_code == 400

# --- Missing Error Path Coverage & Final Gaps ---

@pytest.mark.asyncio
async def test_ipfs_get_fernet_generate_key():
    from ipfs_client import _get_fernet
    with patch("ipfs_client.get_settings") as mock_settings:
        mock_settings.return_value.encryption_key = ""
        f = _get_fernet()
        assert f is not None

@pytest.mark.asyncio
async def test_ipfs_pinata_headers_no_jwt():
    from ipfs_client import _pinata_headers
    with patch("ipfs_client.get_settings") as mock_settings:
        mock_settings.return_value.pinata_jwt = ""
        mock_settings.return_value.pinata_api_key = "k"
        mock_settings.return_value.pinata_secret_api_key = "s"
        headers = _pinata_headers()
        assert "pinata_api_key" in headers

@pytest.mark.asyncio
async def test_orchestrate_symptoms_json_fail():
    analyzer = MolbotAgent(1, "Analyzer", "http://analyzer", "medical-ai", 1000, "STX")
    formatter = MolbotAgent(2, "Formatter", "http://formatter", "report-formatter", 500, "STX")
    with patch("molbot_orchestrator.registry.discover") as mock_disc:
        mock_disc.side_effect = lambda st: analyzer if st == "medical-ai" else formatter if st == "report-formatter" else None
        async def mock_call(endpoint, payload, price_ustx, step):
            step.status = "paid"
            if "symptoms" in payload: return "raw analysis"
            return "invalid-json"
        with patch("molbot_orchestrator._call_molbot_with_x402_payment", side_effect=mock_call):
            res = await orchestrate_symptoms("headache")
            assert res.formatted_report == {"raw": "invalid-json"}

@pytest.mark.asyncio
async def test_orchestrate_document_json_fail():
    analyzer = MolbotAgent(1, "Bot", "http://bot", "medical-ai-document", 1000, "STX")
    formatter = MolbotAgent(2, "Formatter", "http://formatter", "report-formatter", 500, "STX")
    with patch("molbot_orchestrator.registry.discover") as mock_disc:
        mock_disc.side_effect = lambda st: analyzer if st == "medical-ai-document" else formatter if st == "report-formatter" else None
        with patch("molbot_orchestrator._call_molbot_document_with_x402", return_value="raw"):
            async def mock_fmt(endpoint, payload, price_ustx, step):
                step.status = "paid"
                return "invalid-json"
            with patch("molbot_orchestrator._call_molbot_with_x402_payment", side_effect=mock_fmt):
                res = await orchestrate_document(b"data", "test.pdf")
                assert res.formatted_report == {"raw": "invalid-json"}

@pytest.mark.asyncio
async def test_orchestrator_call_200_free():
    step = PaymentStep("B", "T", "http://b", 100, "STX")
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(200, json={"analysis": "free data"}))
        res = await _call_molbot_with_x402_payment("http://b", {}, 100, step)
        assert res == "free data"
        assert step.status == "free"

@pytest.mark.asyncio
async def test_orchestrator_doc_call_200_free():
    step = PaymentStep("B", "T", "http://b", 100, "STX")
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(200, json={"analysis": "free data"}))
        res = await _call_molbot_document_with_x402("http://b", b"d", "f", 100, step)
        assert res == "free data"
        assert step.status == "free"

@pytest.mark.asyncio
async def test_registry_read_agent_count_fail():
    with patch("molbot_registry.get_settings") as mock_settings:
        # Ensure it returns a string for the URL
        mock_settings.return_value.stacks_api_url = "http://api"
        mock_settings.return_value.registry_contract_address = "ADDR"
        mock_settings.return_value.stx_address = "S1"
        with respx.mock:
            respx.post(url__regex=r".*/get-agent-count").mock(return_value=Response(500))
            count = await registry._read_agent_count()
            assert count == 0

@pytest.mark.asyncio
async def test_registry_read_agent_at_index_fail():
    from molbot_registry import registry
    with patch.object(registry, "_read_agent", return_value=None):
        # We target refresh_from_chain which calls _read_agent
        with patch.object(registry, "_read_agent_count", return_value=1):
            with patch("molbot_registry.get_settings") as mock_settings:
                mock_settings.return_value.stacks_api_url = "http://api"
                success = await registry.refresh_from_chain()
                assert success is False

@pytest.mark.asyncio
async def test_registry_discover_all_no_match():
    registry._agents = [MolbotAgent(1, "A", "U", "type-A", 100, "STX")]
    agents = registry.discover_all("type-B")
    assert len(agents) == 0

@pytest.mark.asyncio
async def test_x402_middleware_no_payment_header():
    # To test the middleware effectively, we can add it to a fresh app
    from fastapi import FastAPI
    from x402_middleware import X402StacksMiddleware
    test_app = FastAPI()
    test_app.add_middleware(X402StacksMiddleware)
    
    @test_app.post("/api/analyze/symptoms")
    async def dummy(): return {"ok": True}
    
    client = TestClient(test_app)
    with patch("x402_middleware.get_settings") as mock_settings:
        mock_settings.return_value.x402_active = True
        mock_settings.return_value.stx_address = "S1"
        mock_settings.return_value.stacks_network = "testnet"
        # The middleware looks at PAID_ROUTES which is a global in the module
        # It covers "POST /api/analyze/symptoms"
        response = client.post("/api/analyze/symptoms")
        assert response.status_code == 402

@pytest.mark.asyncio
async def test_x402_stacks_validate_fail():
    from x402_stacks import verify_payment
    with patch("x402_stacks.get_settings") as mock_settings:
        mock_settings.return_value.stacks_api_url = ""
        # Insufficient payment
        res = await verify_payment({"signedTransaction": "0x123", "sender": "S1", "amount": "100"}, "R1", 1000)
        assert res.valid is False
        assert "Insufficient payment" in res.error

@pytest.mark.asyncio
async def test_x402_stacks_validate_exception():
    from x402_stacks import verify_payment
    # Pass None to trigger exception
    res = await verify_payment(None, "R1", 100)
    assert res.valid is False
    assert "NoneType" in res.error

# --- Final Edge Cases for 100% ---

@pytest.mark.asyncio
async def test_final_main_coverage_gaps():
    client = TestClient(app)
    
    # Line 145: upload_record no filename
    # We use a trick to pass an empty filename that FastAPI accepts but our code catches
    from fastapi import UploadFile
    import main
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = ""
    with pytest.raises(HTTPException) as exc:
        await main.upload_record(file=mock_file)
    assert exc.value.status_code == 400

    # Line 165: upload_record size limit
    mock_file.filename = "test.txt"
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=b"a" * (11 * 1024 * 1024))
    with pytest.raises(HTTPException) as exc:
        await main.upload_record(file=mock_file)
    assert exc.value.status_code == 400

    # Line 197: analyze_document_endpoint size limit
    mock_file.filename = "test.pdf"
    mock_file.read = AsyncMock(return_value=b"a" * (11 * 1024 * 1024))
    with pytest.raises(HTTPException) as exc:
        await main.analyze_document_endpoint(file=mock_file)
    assert exc.value.status_code == 400

    # Line 158: upload_record unsupported type
    mock_file.filename = "test.exe"
    mock_file.content_type = "application/x-msdownload"
    with pytest.raises(HTTPException) as exc:
        await main.upload_record(file=mock_file)
    assert exc.value.status_code == 400

    # Line 207: analyze_document_endpoint fail result
    with patch("main.analyze_document", return_value={"success": False, "error": "AI fail"}):
        mock_file.filename = "test.pdf"
        mock_file.read = AsyncMock(return_value=b"data")
        with pytest.raises(HTTPException) as exc:
            await main.analyze_document_endpoint(file=mock_file)
        assert exc.value.status_code == 422

    # Line 338: orchestrate_document_endpoint exception
    with patch("main.orchestrate_document", side_effect=Exception("Crash")):
        mock_file.filename = "test.pdf"
        mock_file.read = AsyncMock(return_value=b"data")
        with pytest.raises(HTTPException) as exc:
            await main.orchestrate_document_endpoint(file=mock_file)
        # Now it catches and returns 502
        assert exc.value.status_code == 502

    # Line 228: analyze_symptoms_endpoint fail result
    with patch("main.analyze_symptoms", return_value={"success": False, "error": "AI fail"}):
        with pytest.raises(HTTPException) as exc:
            await main.analyze_symptoms_endpoint(main.SymptomsRequest(symptoms="help me"))
        assert exc.value.status_code == 422

    # Line 259: discover_molbot not found
    with patch("main.registry.discover_all", return_value=[]):
        with pytest.raises(HTTPException) as exc:
            await main.discover_molbot("unknown")
        assert exc.value.status_code == 404

    # Line 323/327: orchestrate_document_endpoint no filename/size
    mock_file.filename = ""
    with pytest.raises(HTTPException) as exc:
        await main.orchestrate_document_endpoint(file=mock_file)
    assert exc.value.status_code == 400
    
    mock_file.filename = "test.pdf"
    mock_file.read = AsyncMock(return_value=b"a" * (11 * 1024 * 1024))
    with pytest.raises(HTTPException) as exc:
        await main.orchestrate_document_endpoint(file=mock_file)
    assert exc.value.status_code == 400

@pytest.mark.asyncio
async def test_final_orchestrator_coverage_gaps():
    from molbot_orchestrator import orchestrate_document, _call_molbot_with_x402_payment, _call_molbot_document_with_x402
    
    # Line 197-198 of orchestrator: document call returns None
    with patch("molbot_orchestrator.registry.discover", return_value=MolbotAgent(1, "B", "U", "T", 10, "STX")):
        with patch("molbot_orchestrator._call_molbot_document_with_x402", return_value=None):
            res = await orchestrate_document(b"data", "test.pdf")
            assert res.success is False
            assert "Document analyzer call failed" in res.error

    # Line 308-311: _call_molbot_with_x402_payment error status
    step = PaymentStep("B", "T", "http://b", 100, "STX")
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(404))
        res = await _call_molbot_with_x402_payment("http://b", {}, 100, step)
        assert res is None
        assert step.status == "error-404"

    # Line 362-365: _call_molbot_document_with_x402 error status
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(404))
        res = await _call_molbot_document_with_x402("http://b", b"data", "test.pdf", 100, step)
        assert res is None
        assert step.status == "error-404"

@pytest.mark.asyncio
async def test_final_registry_coverage_gaps():
    from molbot_registry import registry
    # Line 75: list_agents active_only=False
    registry._agents = [MolbotAgent(1, "A", "U", "T", 10, "STX", active=False)]
    assert len(registry.list_agents(active_only=False)) == 1
    assert len(registry.list_agents(active_only=True)) == 0

    # Line 79-82: discover no match
    assert registry.discover("wrong") is None

    # Line 137: registry empty chain
    with patch.object(registry, "_read_agent_count", return_value=0):
        with patch("molbot_registry.get_settings") as mock_settings:
            mock_settings.return_value.stacks_api_url = "http://api"
            res = await registry.refresh_from_chain()
            assert res is False

@pytest.mark.asyncio
async def test_main_orchestrate_symptoms_fail_path():
    from main import orchestrate_endpoint, OrchestrateRequest
    mock_res = OrchestrationResult(success=False, error="Symptom fail")
    with patch("main.orchestrate_symptoms", return_value=mock_res):
        with pytest.raises(HTTPException) as exc:
            await orchestrate_endpoint(OrchestrateRequest(symptoms="cough"))
        assert exc.value.status_code == 502

@pytest.mark.asyncio
async def test_main_orchestrate_document_fail_path():
    from main import orchestrate_document_endpoint
    mock_res = OrchestrationResult(success=False, error="Doc fail")
    mock_file = MagicMock()
    mock_file.filename = "test.pdf"
    mock_file.read = AsyncMock(return_value=b"data")
    with patch("main.orchestrate_document", return_value=mock_res):
        with pytest.raises(HTTPException) as exc:
            await orchestrate_document_endpoint(file=mock_file)
        assert exc.value.status_code == 502

@pytest.mark.asyncio
async def test_main_entrypoint_final():
    import runpy
    import main
    with patch("main.uvicorn.run") as mock_run:
        # We use runpy to run the module as __main__
        try:
            # This might raise SystemExit or similar if it finishes
            # Wrapping in try/except just in case
            runpy.run_module("main", run_name="__main__")
        except:
            pass
        mock_run.assert_called()

@pytest.mark.asyncio
async def test_ai_analyzer_pdf_branch():
    from ai_analyzer import analyze_document, extract_text_from_pdf
    
    # Test the function directly to hit lines 74-76
    with patch("PyPDF2.PdfReader") as mock_reader:
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "extracted content"
        mock_reader.return_value.pages = [mock_page]
        res = extract_text_from_pdf(b"dummy pdf")
        assert res == "extracted content"

    # Test the usage in analyze_document
    with patch("ai_analyzer.extract_text_from_pdf", return_value="pdf content"):
        with patch("ai_analyzer._query_hf", return_value="ai summary"):
            res = await analyze_document(b"pdf data", "test.pdf")
            assert res["success"] is True
            assert res["analysis"] == "ai summary"

@pytest.mark.asyncio
async def test_main_startup_coverage_final():
    import importlib
    import main
    with patch("main.get_settings") as mock_settings:
        mock_settings.return_value.x402_active = True
        mock_settings.return_value.stx_address = "S1"
        with patch("main.setup_x402_stacks", return_value=True):
            importlib.reload(main)
        with patch("main.setup_x402_stacks", return_value=False):
            importlib.reload(main)
    with patch("main.get_settings") as mock_settings:
        mock_settings.return_value.x402_active = False
        importlib.reload(main)

# --- Missing Error Path Coverage ---

@pytest.mark.asyncio
async def test_registry_refresh_from_chain_no_agents():
    # Directly mock the methods on the registry object
    with patch.object(registry, "_read_agent_count", return_value=0):
        with patch("molbot_registry.get_settings") as mock_settings:
            mock_settings.return_value.stacks_api_url = "http://api"
            mock_settings.return_value.registry_contract_address = "ADDR"
            success = await registry.refresh_from_chain()
            assert success is False

@pytest.mark.asyncio
async def test_orchestrate_symptoms_call_exception():
    analyzer = MolbotAgent(1, "Bot", "http://bot", "medical-ai", 1000, "STX")
    # Patch the registry.discover call inside molbot_orchestrator
    with patch("molbot_orchestrator.registry.discover", return_value=analyzer):
        with patch("molbot_orchestrator._call_molbot_with_x402_payment", side_effect=Exception("Net fail")):
            res = await orchestrate_symptoms("headache")
            assert res.success is False
            assert "Net fail" in res.error

@pytest.mark.asyncio
async def test_orchestrate_document_call_exception():
    analyzer = MolbotAgent(1, "Bot", "http://bot", "medical-ai-document", 1000, "STX")
    with patch("molbot_orchestrator.registry.discover", return_value=analyzer):
        with patch("molbot_orchestrator._call_molbot_document_with_x402", side_effect=Exception("Net fail")):
            res = await orchestrate_document(b"data", "test.pdf")
            assert res.success is False
            assert "Net fail" in res.error

@pytest.mark.asyncio
async def test_orchestrate_document_no_fallback():
    # Discover medical-ai-document fails, and fallback medical-ai also fails
    with patch("molbot_orchestrator.registry.discover", return_value=None):
        res = await orchestrate_document(b"data", "test.pdf")
        assert res.success is False
        assert "No medical-ai molbot" in res.error


# --- Final Precision Coverage Hits ---

@pytest.mark.asyncio
async def test_registry_final_coverage_hits():
    from molbot_registry import registry, MolbotAgent
    from unittest.mock import patch, MagicMock
    import respx
    from httpx import Response
    
    # Line 81: discover() return agent (Success Path)
    registry._agents = [MolbotAgent(1, "A", "U", "T1", 10, "STX", active=True)]
    assert registry.discover("T1").name == "A"
    
    # Line 82: discover() return None
    assert registry.discover("T2") is None
    
    # Line 99: refresh_from_chain() no API URL early return
    with patch("molbot_registry.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = ""
        assert await registry.refresh_from_chain() is False
        
    # Line 105: refresh_from_chain() count=0
    with patch.object(registry, "_read_agent_count", return_value=0):
        with patch("molbot_registry.get_settings") as mock_gs:
            mock_gs.return_value.stacks_api_url = "http://api"
            assert await registry.refresh_from_chain() is False
            
    # Line 119-120: refresh_from_chain() exception
    with patch.object(registry, "_read_agent_count", side_effect=Exception("Hard fail")):
         with patch("molbot_registry.get_settings") as mock_gs:
            mock_gs.return_value.stacks_api_url = "http://api"
            assert await registry.refresh_from_chain() is False

    # Line 128: _read_agent_count() no API URL
    with patch("molbot_registry.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = ""
        assert await registry._read_agent_count() == 0
        
    # Line 140-141: hex_val parsing in _read_agent_count
    with patch("molbot_registry.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = "http://api"
        mock_gs.return_value.registry_contract_address = "ADDR"
        mock_gs.return_value.stx_address = "S1"
        url = "http://api/v2/contracts/call-read/ADDR/molbot-registry/get-agent-count"
        with respx.mock:
            respx.post(url).mock(return_value=Response(200, json={"okay": True, "result": "0x00000000000000000000000000000005"}))
            res = await registry._read_agent_count()
            assert res == 5
            
    # Line 144: _read_agent_count() exception path
    with patch("molbot_registry.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = "http://api"
        with respx.mock:
            respx.post().mock(side_effect=Exception("API fail"))
            assert await registry._read_agent_count() == 0
            
    # Line 150: _read_agent() return None
    assert await registry._read_agent(1) is None

@pytest.mark.asyncio
async def test_orchestrator_final_coverage_hits():
    from molbot_orchestrator import _call_molbot_with_x402_payment, _call_molbot_document_with_x402, PaymentStep
    from unittest.mock import patch
    import respx
    from httpx import Response
    step = PaymentStep("B", "T", "http://b", 100, "STX")
    # Line 305-306: _call_molbot_with_x402_payment error status
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(500))
        assert await _call_molbot_with_x402_payment("http://b", {}, 100, step) is None
        assert "error-500" in step.status
    # Line 309: _call_molbot_with_x402_payment exception
    with respx.mock:
        respx.post("http://b").mock(side_effect=Exception("Crash"))
        assert await _call_molbot_with_x402_payment("http://b", {}, 100, step) is None
        assert "error: Crash" in step.status
    # Line 359-360: _call_molbot_document_with_x402 error status
    with respx.mock:
        respx.post("http://b").mock(return_value=Response(500))
        assert await _call_molbot_document_with_x402("http://b", b"data", "t.pdf", 100, step) is None
    # Line 363: _call_molbot_document_with_x402 exception
    with respx.mock:
        respx.post("http://b").mock(side_effect=Exception("Crash"))
        assert await _call_molbot_document_with_x402("http://b", b"data", "t.pdf", 100, step) is None

@pytest.mark.asyncio
async def test_main_final_coverage_hits():
    import main
    from molbot_registry import MolbotAgent
    from fastapi import UploadFile, HTTPException
    from unittest.mock import MagicMock, AsyncMock, patch
    
    # upload_record no filename
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = ""
    with pytest.raises(HTTPException) as exc:
        await main.upload_record(file=mock_file)
    assert exc.value.status_code == 400

    # analyze_document_endpoint no filename
    with pytest.raises(HTTPException) as exc:
        await main.analyze_document_endpoint(file=mock_file)
    assert exc.value.status_code == 400

    # success paths
    with patch("main.analyze_document", return_value={"success": True, "analysis": "ok", "model": "m"}):
        mock_file.filename = "t.pdf"
        mock_file.read = AsyncMock(return_value=b"data")
        res = await main.analyze_document_endpoint(file=mock_file)
        assert res.success is True

    with patch("main.analyze_symptoms", return_value={"success": True, "analysis": "ok", "model": "m"}):
        res = await main.analyze_symptoms_endpoint(main.SymptomsRequest(symptoms="cough and fever"))
        assert res.success is True

    with patch("main.registry.discover_all", return_value=[]):
        with pytest.raises(HTTPException) as exc:
            await main.discover_molbot("nonexistent")
        assert exc.value.status_code == 404

    with patch("main.registry.discover_all", return_value=[MolbotAgent(1, "B", "U", "T", 10, "STX")]):
        res = await main.discover_molbot("any")
        assert len(res["agents"]) == 1

    with patch("main.orchestrate_symptoms", side_effect=Exception("Crash")):
        with pytest.raises(HTTPException) as exc:
            await main.orchestrate_endpoint(main.OrchestrateRequest(symptoms="cough and fever"))
        assert exc.value.status_code == 502

@pytest.mark.asyncio
async def test_x402_middleware_hits():
    from x402_middleware import X402StacksMiddleware, RoutePayment
    from fastapi import Request
    from unittest.mock import MagicMock, patch, AsyncMock
    from fastapi.responses import JSONResponse
    
    app = MagicMock()
    middleware = X402StacksMiddleware(app)
    request = MagicMock(spec=Request)
    call_next = AsyncMock(return_value=JSONResponse(status_code=200, content={"ok": True}))
    
    # Line 83: Non-paid route hit
    request.url.path = "/health"
    request.method = "GET"
    resp = await middleware.dispatch(request, call_next)
    assert resp.status_code == 200
    
    # Line 106-111: Invalid payment signature (ValueError)
    request.url.path = "/api/analyze/symptoms"
    request.method = "POST"
    request.headers = {"payment-signature": "bad"}
    with patch("x402_middleware.decode_payment_signature", side_effect=ValueError("Invalid")):
        resp = await middleware.dispatch(request, call_next)
        assert resp.status_code == 400

@pytest.mark.asyncio
async def test_x402_stacks_hits():
    from x402_stacks import create_stx_payment, decode_payment_signature, verify_payment, _broadcast_transaction
    from unittest.mock import patch, MagicMock
    import respx
    from httpx import Response
    
    # Line 135: Missing sender
    res = await verify_payment({"signedTransaction": "0x"}, "S1", 10)
    assert res.valid is False
    assert "Missing sender" in res.error
    
    # Line 182-183: Broadcast error response
    with patch("x402_stacks.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = "http://api"
        with respx.mock:
            respx.post("http://api/v2/transactions").mock(return_value=Response(500))
            res = await _broadcast_transaction("0x")
            assert res is None
            
    # Line 184: Broadcast exception
    with patch("x402_stacks.get_settings") as mock_gs:
        mock_gs.return_value.stacks_api_url = "http://api"
        with respx.mock:
            respx.post("http://api/v2/transactions").mock(side_effect=Exception("Crash"))
            res = await _broadcast_transaction("0x")
            assert res is None

@pytest.mark.asyncio
async def test_main_startup_hits_refined():
    import main
    from unittest.mock import patch, MagicMock
    
    mock_settings = MagicMock()
    
    # settings.x402_active = True, setup success
    mock_settings.x402_active = True
    with patch("main.setup_x402_stacks", return_value=True):
        main.init_x402(main.app, mock_settings)
            
    # settings.x402_active = True, setup fails
    with patch("main.setup_x402_stacks", return_value=False):
        main.init_x402(main.app, mock_settings)

    # settings.x402_active = False
    mock_settings.x402_active = False
    main.init_x402(main.app, mock_settings)

@pytest.mark.asyncio
async def test_ai_analyzer_final_hits():
    from ai_analyzer import analyze_symptoms, extract_text_from_pdf
    from unittest.mock import patch, MagicMock
    # analyze_symptoms success
    with patch("ai_analyzer._query_hf", return_value="ok"):
        res = await analyze_symptoms("I feel good")
        assert res["success"] is True
    # extract_text_from_pdf
    with patch("PyPDF2.PdfReader") as mock_reader:
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "extracted text"
        mock_reader.return_value.pages = [mock_page]
        res = extract_text_from_pdf(b"pdf data")
        assert res == "extracted text"
