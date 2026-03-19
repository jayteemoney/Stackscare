"""
Molbot Registry Client.

Reads the on-chain agent catalog from the molbot-registry Clarity contract.
Falls back to an in-memory seed list when the blockchain is unavailable.

Each molbot entry contains:
  - name, endpoint_url, service_type, price_ustx, token_type, active
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class MolbotAgent:
    """A registered molbot agent."""
    agent_id: int
    name: str
    endpoint_url: str
    service_type: str
    price_ustx: int
    token_type: str
    active: bool = True
    owner: Optional[str] = None


# Seed agents — used as fallback and for local dev.
# In production these would be read from the on-chain registry.
SEED_AGENTS: list[MolbotAgent] = [
    MolbotAgent(
        agent_id=1,
        name="MedAnalyzer",
        endpoint_url="http://localhost:8000/api/analyze/symptoms",
        service_type="medical-ai",
        price_ustx=10_000,   # 0.01 STX
        token_type="STX",
    ),
    MolbotAgent(
        agent_id=2,
        name="DocAnalyzer",
        endpoint_url="http://localhost:8000/api/analyze/document",
        service_type="medical-ai-document",
        price_ustx=10_000,
        token_type="STX",
    ),
    MolbotAgent(
        agent_id=3,
        name="ReportFormatter",
        endpoint_url="http://localhost:8000/api/molbot/format",
        service_type="report-formatter",
        price_ustx=5_000,    # 0.005 STX
        token_type="STX",
    ),
]


@dataclass
class MolbotRegistry:
    """Registry client with in-memory cache backed by on-chain data."""
    _agents: list[MolbotAgent] = field(default_factory=lambda: list(SEED_AGENTS))
    _loaded_from_chain: bool = False

    def list_agents(self, active_only: bool = True) -> list[MolbotAgent]:
        """Return all registered agents."""
        if active_only:
            return [a for a in self._agents if a.active]
        return list(self._agents)

    def discover(self, service_type: str) -> Optional[MolbotAgent]:
        """Find the first active agent matching the given service type."""
        for agent in self._agents:
            if agent.service_type == service_type and agent.active:
                return agent
        return None

    def discover_all(self, service_type: str) -> list[MolbotAgent]:
        """Find all active agents matching the given service type."""
        return [
            a for a in self._agents
            if a.service_type == service_type and a.active
        ]

    async def refresh_from_chain(self) -> bool:
        """
        Attempt to load agent data from the on-chain molbot-registry contract.
        Returns True if successful, False if we're using the seed fallback.
        """
        settings = get_settings()
        if not settings.stacks_api_url:
            logger.info("No Stacks API URL configured — using seed agents")
            return False

        try:
            agent_count = await self._read_agent_count()
            if agent_count == 0:
                logger.info("On-chain registry empty — using seed agents")
                return False

            chain_agents = []
            for i in range(1, agent_count + 1):
                agent = await self._read_agent(i)
                if agent:
                    chain_agents.append(agent)

            if chain_agents:
                self._agents = chain_agents
                self._loaded_from_chain = True
                logger.info(f"Loaded {len(chain_agents)} agents from on-chain registry")
                return True

        except Exception as e:
            logger.warning(f"Failed to read on-chain registry: {e} — using seed agents")

        return False

    async def _read_agent_count(self) -> int:
        """Read get-agent-count from the contract."""
        settings = get_settings()
        if not settings.stacks_api_url:
            return 0
        url = (
            f"{settings.stacks_api_url}/v2/contracts/call-read/"
            f"{settings.registry_contract_address}/molbot-registry/get-agent-count"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json={"sender": settings.stx_address, "arguments": []})
                resp.raise_for_status()
                data = resp.json()
                # Parse Clarity uint response
                if data.get("okay") and data.get("result"):
                    hex_val = data["result"].replace("0x", "")
                    return int(hex_val[-16:], 16) if len(hex_val) >= 16 else 0
        except Exception as e:
            logger.warning(f"Error reading agent count: {e}")
        return 0

    async def _read_agent(self, agent_id: int) -> Optional[MolbotAgent]:
        """Read a single agent from the contract (simplified)."""
        # In production, parse full Clarity tuple responses.
        # For hackathon, the seed list serves as the source of truth.
        return None

    def to_dict_list(self) -> list[dict]:
        """Serialize agents for API responses."""
        return [
            {
                "agentId": a.agent_id,
                "name": a.name,
                "endpointUrl": a.endpoint_url,
                "serviceType": a.service_type,
                "priceUstx": a.price_ustx,
                "tokenType": a.token_type,
                "active": a.active,
            }
            for a in self._agents
        ]


# Module-level singleton
registry = MolbotRegistry()
