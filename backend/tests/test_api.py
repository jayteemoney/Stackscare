import pytest
from httpx import AsyncClient, ASGITransport
from main import app
import respx
from httpx import Response

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "stackscare-molbot-commerce"}

@pytest.mark.asyncio
async def test_root_endpoint(client):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "protocol" in data
    assert data["protocol"]["x402"] is True

@respx.mock
@pytest.mark.asyncio
async def test_upload_endpoint(client):
    # Mock Pinata upload
    respx.post("https://api.pinata.cloud/pinning/pinFileToIPFS").mock(
        return_value=Response(200, json={"IpfsHash": "QmTestHash123"})
    )
    
    files = {"file": ("test.txt", b"hello world", "text/plain")}
    response = await client.post("/api/upload", files=files, data={"record_type": "consultation"})
    
    assert response.status_code == 200
    assert response.json()["ipfs_hash"] == "QmTestHash123"

@respx.mock
@pytest.mark.asyncio
async def test_analyze_symptoms_endpoint_no_payment(client):
    """
    Test symptoms analysis when x402 is disabled (or payment mocked).
    """
    # Mock HuggingFace / Mistral API
    respx.post(url="https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2").mock(
        return_value=Response(200, json=[{"generated_text": "AI Analysis result"}])
    )
    
    payload = {"symptoms": "Headache and fever"}
    response = await client.post("/api/analyze/symptoms", json=payload)
    
    # If x402 is active, this might return 402. For now we check 200/402 behavior.
    if response.status_code == 200:
        assert "analysis" in response.json()
    elif response.status_code == 402:
        assert "payment required" in response.text.lower()

@pytest.mark.asyncio
async def test_molbot_registry(client):
    response = await client.get("/api/molbot/registry")
    assert response.status_code == 200
    assert "agents" in response.json()
    assert "count" in response.json()

@pytest.mark.asyncio
async def test_orchestrate_invalid_input(client):
    response = await client.post("/api/molbot/orchestrate", json={"symptoms": "abc"})
    assert response.status_code == 400
    assert "min 5 chars" in response.json()["detail"]
