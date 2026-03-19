"""
AI Medical Analysis Module
Uses Hugging Face Inference API (Mistral-7B-Instruct) for medical report
summarization, risk assessment, and symptom analysis.

Swap to Claude later by replacing _query_hf() with an Anthropic client call
and updating HUGGINGFACE_API_KEY -> ANTHROPIC_API_KEY in config/env.

References:
  - HF Inference API: https://huggingface.co/docs/api-inference/index
  - Model: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3
"""

import io
import httpx
import PyPDF2
from config import get_settings

HF_ROUTER_URL = "https://router.huggingface.co/featherless-ai/v1/chat/completions"
HF_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"

SYSTEM_PROMPT = """You are a medical AI assistant that helps patients understand their health records.
Provide clear, plain-language summaries. Never diagnose — only summarize and highlight areas to discuss with a doctor.
Always include a disclaimer that your analysis is NOT a substitute for professional medical advice."""

ANALYSIS_USER_PROMPT = """Analyze the following medical document and provide:
1. **Summary** (2-3 sentences): What is this document about?
2. **Key Findings**: Bullet-point list of the most important health information.
3. **Risk Level**: Low | Moderate | High | Critical — with a one-sentence justification.
4. **Recommendations**: 3-5 actionable items for the patient to discuss with their doctor.
5. **Disclaimer**: Remind the patient this is AI analysis, not medical advice.

Document content:
---
{content}
---"""

SYMPTOM_USER_PROMPT = """A patient has described the following symptoms: "{symptoms}"

Provide:
1. **Detected Concerns**: What you identified from the description.
2. **Possible Conditions**: 2-4 possible (not definitive) conditions, ordered by likelihood.
3. **Risk Level**: Low | Moderate | High | Critical.
4. **Immediate Actions**: What the patient should do right now.
5. **Questions for Your Doctor**: 3 specific questions to bring to the next appointment.
6. **Disclaimer**: Remind the patient this is AI analysis, not medical advice."""


async def _query_hf(system: str, user: str) -> str:
    """Send a chat request to the HF Router (featherless-ai) and return the response."""
    headers = {"Authorization": f"Bearer {get_settings().huggingface_api_key}"}
    payload = {
        "model": HF_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 800,
        "temperature": 0.3,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(HF_ROUTER_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    pages = [p.extract_text() for p in reader.pages if p.extract_text()]
    return "\n\n".join(pages)


async def analyze_document(file_bytes: bytes, filename: str) -> dict:
    """Analyze a medical document using Mistral via HF Inference API."""
    if filename.lower().endswith(".pdf"):
        content = extract_text_from_pdf(file_bytes)
    else:
        content = file_bytes.decode("utf-8", errors="replace")

    if not content.strip():
        return {"success": False, "error": "Could not extract readable text from the document."}

    user_prompt = ANALYSIS_USER_PROMPT.format(content=content[:4000])

    try:
        analysis = await _query_hf(SYSTEM_PROMPT, user_prompt)
        return {"success": True, "analysis": analysis, "model": HF_MODEL}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


async def analyze_symptoms(symptoms: str) -> dict:
    """Analyze patient-described symptoms using Mistral via HF Inference API."""
    if not symptoms or len(symptoms.strip()) < 5:
        return {"success": False, "error": "Please describe your symptoms in more detail."}

    user_prompt = SYMPTOM_USER_PROMPT.format(symptoms=symptoms[:1000])

    try:
        analysis = await _query_hf(SYSTEM_PROMPT, user_prompt)
        return {"success": True, "analysis": analysis, "model": HF_MODEL}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
