"""
Embedding service for generating vector representations of text.
Uses sentence-transformers by default, with optional OpenAI support.

DESIGN DECISIONS:
1. Use all-MiniLM-L6-v2 for balance of speed and quality (384 dimensions)
2. Batch processing for efficiency during ingestion
3. Caching of model to avoid repeated loading
4. Support for cross-encoder reranking
"""

import logging
from typing import List, Optional, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service for generating text embeddings.

    Uses sentence-transformers models which are:
    - Open source and free
    - Fast and efficient
    - Good quality for semantic similarity
    """

    def __init__(self):
        self.settings = get_settings()
        self._model: Optional[SentenceTransformer] = None
        self._reranker: Optional[CrossEncoder] = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy load the embedding model."""
        if self._model is None:
            logger.info(f"Loading embedding model: {self.settings.embedding_model}")
            self._model = SentenceTransformer(self.settings.embedding_model)
            logger.info(
                f"Embedding model loaded. Dimension: {self._model.get_sentence_embedding_dimension()}"
            )
        return self._model

    @property
    def reranker(self) -> CrossEncoder:
        """Lazy load the reranker model."""
        if self._reranker is None:
            logger.info(f"Loading reranker model: {self.settings.reranker_model}")
            self._reranker = CrossEncoder(self.settings.reranker_model)
            logger.info("Reranker model loaded")
        return self._reranker

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        # Clean and normalize text
        text = self._preprocess_text(text)

        # Generate embedding
        embedding = self.model.encode(text, convert_to_numpy=True)

        return embedding.tolist()

    def embed_texts(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently.

        Args:
            texts: List of texts to embed
            batch_size: Batch size for processing

        Returns:
            List of embedding vectors
        """
        # Preprocess all texts
        processed_texts = [self._preprocess_text(t) for t in texts]

        # Generate embeddings in batches
        embeddings = self.model.encode(
            processed_texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            show_progress_bar=len(texts) > 100,
        )

        return embeddings.tolist()

    def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: Optional[int] = None,
    ) -> List[Tuple[int, float]]:
        """
        Rerank documents using cross-encoder for more accurate relevance.

        Cross-encoders are more accurate than bi-encoders for ranking
        but slower, so we use them only on the top candidates from
        initial retrieval.

        Args:
            query: Search query
            documents: List of document texts to rerank
            top_k: Number of top results to return (None = all)

        Returns:
            List of (document_index, score) tuples, sorted by score descending
        """
        if not self.settings.use_reranker:
            # Return original order with placeholder scores
            return [(i, 1.0) for i in range(len(documents))]

        # Create query-document pairs
        pairs = [[query, doc] for doc in documents]

        # Get cross-encoder scores
        scores = self.reranker.predict(pairs)

        # Create (index, score) pairs and sort by score
        indexed_scores = [(i, float(score)) for i, score in enumerate(scores)]
        indexed_scores.sort(key=lambda x: x[1], reverse=True)

        if top_k is not None:
            indexed_scores = indexed_scores[:top_k]

        return indexed_scores

    def compute_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float],
    ) -> float:
        """
        Compute cosine similarity between two embeddings.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity score (0 to 1 for normalized vectors)
        """
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)

        # Cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    def combine_embeddings(
        self,
        embeddings: List[List[float]],
        weights: Optional[List[float]] = None,
    ) -> List[float]:
        """
        Combine multiple embeddings into a single vector.
        Useful for combining query with memory embeddings.

        Args:
            embeddings: List of embedding vectors
            weights: Optional weights for each embedding

        Returns:
            Combined embedding vector (normalized)
        """
        if not embeddings:
            raise ValueError("No embeddings to combine")

        if weights is None:
            weights = [1.0] * len(embeddings)

        if len(weights) != len(embeddings):
            raise ValueError("Weights must match number of embeddings")

        # Weighted sum
        combined = np.zeros(len(embeddings[0]))
        for emb, weight in zip(embeddings, weights):
            combined += np.array(emb) * weight

        # Normalize
        norm = np.linalg.norm(combined)
        if norm > 0:
            combined = combined / norm

        return combined.tolist()

    def _preprocess_text(self, text: str) -> str:
        """
        Preprocess text before embedding.

        - Remove excessive whitespace
        - Normalize unicode
        - Truncate if too long
        """
        # Basic cleaning
        text = " ".join(text.split())

        # Truncate very long texts (model has max length)
        max_length = 512  # tokens, roughly
        words = text.split()
        if len(words) > max_length:
            text = " ".join(words[:max_length])

        return text


# Global instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
