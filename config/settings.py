"""
SuperCompare - Configuration
"""
import os
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class ScraperConfig:
    headless: bool = True
    timeout_ms: int = 30000
    max_retries: int = 3
    delay_between_requests: float = 2.0  # segundos entre requests (sé amable con los servers)
    cache_dir: str = "data/cache"
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )


@dataclass
class DatabaseConfig:
    host: str = os.getenv("DB_HOST", "localhost")
    port: int = int(os.getenv("DB_PORT", "5432"))
    name: str = os.getenv("DB_NAME", "supercompare")
    user: str = os.getenv("DB_USER", "postgres")
    password: str = os.getenv("DB_PASSWORD", "postgres")

    @property
    def url(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"

    @property
    def async_url(self) -> str:
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"


@dataclass
class AIConfig:
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 2048


@dataclass
class SupermarketURLs:
    """URLs de categorías a scrapear por supermercado.
    Scrapeamos por categoría, no por search — es más estable."""
    
    carrefour: Dict[str, list] = field(default_factory=lambda: {
        "lacteos": [
            "/almacen/leches/leche-entera",
            "/almacen/leches/leche-descremada",
        ],
        "almacen": [
            "/almacen/aceites-y-vinagres/aceites",
            "/almacen/arroz-y-legumbres/arroz",
            "/almacen/pastas-secas",
            "/almacen/harinas",
        ],
        "bebidas": [
            "/bebidas/aguas",
            "/bebidas/gaseosas",
        ],
        "limpieza": [
            "/limpieza/detergentes-y-lavavajillas",
        ],
    })
    
    coto: Dict[str, list] = field(default_factory=lambda: {
        "lacteos": [
            "/browse/COTO/702/leches",
            "/browse/COTO/705/yogures",
        ],
        "almacen": [
            "/browse/COTO/625/aceites",
            "/browse/COTO/600/arroz",
            "/browse/COTO/605/fideos-y-pastas",
        ],
        "bebidas": [
            "/browse/COTO/400/aguas",
            "/browse/COTO/405/gaseosas",
        ],
    })


@dataclass
class Settings:
    scraper: ScraperConfig = field(default_factory=ScraperConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    ai: AIConfig = field(default_factory=AIConfig)
    urls: SupermarketURLs = field(default_factory=SupermarketURLs)
    api_port: int = 8000
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"


settings = Settings()
