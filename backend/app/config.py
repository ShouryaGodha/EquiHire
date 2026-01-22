"""
Configuration management for the recruitment assistant.
Loads environment variables and provides typed access to settings.
"""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Qdrant Configuration
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_api_key: Optional[str] = None

    # Collection Names
    candidate_chunks_collection: str = "candidate_chunks"
    recruiter_memory_collection: str = "recruiter_memory"

    # Embedding Configuration
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dimension: int = 384

    # Reranker Configuration
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    use_reranker: bool = True

    # Search Configuration
    default_top_k: int = 20
    chunk_size: int = 512  # Max characters per chunk
    chunk_overlap: int = 50  # Overlap between chunks

    # Scoring Weights (must sum to 1.0)
    weight_semantic: float = 0.4
    weight_skills: float = 0.25
    weight_experience: float = 0.15
    weight_role: float = 0.1
    weight_availability: float = 0.05
    weight_feedback: float = 0.05

    # Application
    debug: bool = True
    log_level: str = "INFO"

    # Paths
    data_dir: Path = Path("./data/resumes")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
