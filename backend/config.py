from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    huggingface_api_key: str
    pinata_api_key: str = ""
    pinata_secret_api_key: str = ""
    pinata_jwt: str = ""
    encryption_key: str = ""
    allowed_origins: str = "http://localhost:3000"
    env: str = "development"

    # ── Stacks x402 payment protocol ──
    # Stacks address to receive payments (SP... testnet or ST... mainnet)
    stx_address: str = ""
    # Orchestrator's private key for autonomous agent-to-agent payments
    stx_private_key: str = ""
    # "stacks-testnet" or "stacks-mainnet"
    stacks_network: str = "stacks-testnet"
    # Hiro Stacks API endpoint
    stacks_api_url: str = "https://api.testnet.hiro.so"
    # Deploy address of the molbot-registry contract
    registry_contract_address: str = ""
    # Set to "false" to disable x402 payment requirements (dev/testing bypass)
    x402_enabled: str = "true"

    @property
    def x402_active(self) -> bool:
        return self.x402_enabled.lower() == "true" and bool(self.stx_address)

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
