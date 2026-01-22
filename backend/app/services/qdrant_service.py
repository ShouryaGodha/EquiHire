"""
Qdrant database service for the recruitment assistant.
Handles collection creation, vector storage, and hybrid search.

DESIGN DECISIONS:
1. candidate_chunks collection stores chunked resume embeddings with payload metadata
2. recruiter_memory stores follow-up queries for session continuity
3. Soft filters use payload filtering with should clauses (not must)
4. All operations are idempotent where possible
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchAny,
    MatchValue,
    Range,
    PayloadSchemaType,
    SearchParams,
    SearchRequest as QdrantSearchRequest,
)

from app.config import get_settings
from app.models import (
    CandidateChunk,
    RecruiterMemoryEntry,
    FilterIntent,
    ExtractedMetadata,
)

logger = logging.getLogger(__name__)


class QdrantService:
    """
    Service for all Qdrant operations.

    Collections:
    1. candidate_chunks - Resume chunks with embeddings and metadata payloads
    2. recruiter_memory - Recruiter query history for personalization
    """

    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[QdrantClient] = None

    @property
    def client(self) -> QdrantClient:
        """Lazy initialization of Qdrant client."""
        if self._client is None:
            # Try to connect to Qdrant server, fall back to in-memory mode
            try:
                if self.settings.qdrant_api_key:
                    self._client = QdrantClient(
                        host=self.settings.qdrant_host,
                        port=self.settings.qdrant_port,
                        api_key=self.settings.qdrant_api_key,
                    )
                else:
                    self._client = QdrantClient(
                        host=self.settings.qdrant_host,
                        port=self.settings.qdrant_port,
                    )
                # Test connection
                self._client.get_collections()
                logger.info(
                    f"Connected to Qdrant at {self.settings.qdrant_host}:{self.settings.qdrant_port}"
                )
            except Exception as e:
                logger.warning(f"Could not connect to Qdrant server: {e}")
                logger.info("Using in-memory Qdrant for development/testing")
                self._client = QdrantClient(":memory:")
        return self._client

    # =========================================================================
    # COLLECTION MANAGEMENT
    # =========================================================================

    def init_collections(self) -> None:
        """
        Initialize all required collections with proper schemas.
        Safe to call multiple times - will not recreate existing collections.
        """
        self._init_candidate_chunks_collection()
        self._init_recruiter_memory_collection()
        logger.info("All collections initialized successfully")

    def _init_candidate_chunks_collection(self) -> None:
        """
        Create the candidate_chunks collection.

        Payload Schema:
        - candidate_id: string (parent resume identifier)
        - chunk_index: integer (order in resume)
        - chunk_type: string (summary, experience, education, skills, etc.)
        - text: string (raw chunk text)
        - skills: string[] (extracted skills, lowercase)
        - experience_years: float (approximate)
        - role_category: string (engineering, data_science, etc.)
        - location: string (extracted location)
        - is_remote: boolean
        - companies: string[] (mentioned companies)
        - extraction_confidence: float (0-1)
        - created_at: string (ISO timestamp)
        """
        collection_name = self.settings.candidate_chunks_collection

        # Check if collection exists
        collections = self.client.get_collections().collections
        exists = any(c.name == collection_name for c in collections)

        if exists:
            logger.info(f"Collection '{collection_name}' already exists")
            return

        # Create collection with vector configuration
        self.client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=self.settings.embedding_dimension,
                distance=Distance.COSINE,  # Cosine similarity for text embeddings
            ),
        )

        # Create payload indexes for efficient filtering
        # Skills index - for filtering by required skills
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="skills",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        # Experience years index - for range filtering
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="experience_years",
            field_schema=PayloadSchemaType.FLOAT,
        )

        # Role category index - for filtering by role type
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="role_category",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        # Candidate ID index - for grouping chunks
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="candidate_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        # Location index
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="location",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        logger.info(f"Created collection '{collection_name}' with payload indexes")

    def _init_recruiter_memory_collection(self) -> None:
        """
        Create the recruiter_memory collection.

        Payload Schema:
        - session_id: string (groups queries in a search session)
        - query_text: string (original query)
        - query_type: string ('search' or 'followup')
        - extracted_skills: string[] (skills from query)
        - min_experience: float
        - role_categories: string[]
        - timestamp: string (ISO timestamp)
        """
        collection_name = self.settings.recruiter_memory_collection

        collections = self.client.get_collections().collections
        exists = any(c.name == collection_name for c in collections)

        if exists:
            logger.info(f"Collection '{collection_name}' already exists")
            return

        self.client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=self.settings.embedding_dimension,
                distance=Distance.COSINE,
            ),
        )

        # Session ID index for retrieving session history
        self.client.create_payload_index(
            collection_name=collection_name,
            field_name="session_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        logger.info(f"Created collection '{collection_name}'")

    def reset_collections(self, confirm: bool = False) -> None:
        """Delete and recreate all collections. Use with caution!"""
        if not confirm:
            raise ValueError("Must pass confirm=True to reset collections")

        for collection_name in [
            self.settings.candidate_chunks_collection,
            self.settings.recruiter_memory_collection,
        ]:
            try:
                self.client.delete_collection(collection_name)
                logger.info(f"Deleted collection '{collection_name}'")
            except Exception:
                pass  # Collection may not exist

        self.init_collections()

    # =========================================================================
    # CANDIDATE CHUNK OPERATIONS
    # =========================================================================

    def upsert_candidate_chunk(
        self,
        chunk: CandidateChunk,
        embedding: List[float],
    ) -> None:
        """Store a single candidate chunk with its embedding."""
        payload = {
            "candidate_id": chunk.candidate_id,
            "candidate_name": chunk.candidate_name,
            "chunk_index": chunk.chunk_index,
            "chunk_type": chunk.chunk_type.value,
            "text": chunk.text,
            "skills": chunk.metadata.skills,
            "experience_years": chunk.metadata.experience_years,
            "role_category": chunk.metadata.role_category.value
            if chunk.metadata.role_category
            else None,
            "location": chunk.metadata.location,
            "is_remote": chunk.metadata.is_remote,
            "companies": chunk.metadata.companies,
            "education_level": chunk.metadata.education_level,
            "extraction_confidence": chunk.metadata.extraction_confidence,
            "created_at": chunk.created_at.isoformat(),
        }

        self.client.upsert(
            collection_name=self.settings.candidate_chunks_collection,
            points=[
                PointStruct(
                    id=chunk.id,
                    vector=embedding,
                    payload=payload,
                )
            ],
        )

    def upsert_candidate_chunks_batch(
        self,
        chunks: List[CandidateChunk],
        embeddings: List[List[float]],
    ) -> None:
        """Batch upsert multiple chunks for efficiency."""
        if len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings must have same length")

        points = []
        for chunk, embedding in zip(chunks, embeddings):
            payload = {
                "candidate_id": chunk.candidate_id,
                "candidate_name": chunk.candidate_name,
                "chunk_index": chunk.chunk_index,
                "chunk_type": chunk.chunk_type.value,
                "text": chunk.text,
                "skills": chunk.metadata.skills,
                "experience_years": chunk.metadata.experience_years,
                "role_category": chunk.metadata.role_category.value
                if chunk.metadata.role_category
                else None,
                "location": chunk.metadata.location,
                "is_remote": chunk.metadata.is_remote,
                "companies": chunk.metadata.companies,
                "education_level": chunk.metadata.education_level,
                "extraction_confidence": chunk.metadata.extraction_confidence,
                "created_at": chunk.created_at.isoformat(),
            }
            points.append(
                PointStruct(
                    id=chunk.id,
                    vector=embedding,
                    payload=payload,
                )
            )

        # Batch upsert in chunks of 100
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            self.client.upsert(
                collection_name=self.settings.candidate_chunks_collection,
                points=batch,
            )

        logger.info(f"Upserted {len(points)} candidate chunks")

    def get_candidate_chunks(self, candidate_id: str) -> List[Dict[str, Any]]:
        """Retrieve all chunks for a specific candidate."""
        results = self.client.scroll(
            collection_name=self.settings.candidate_chunks_collection,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="candidate_id",
                        match=MatchValue(value=candidate_id),
                    )
                ]
            ),
            limit=100,
            with_payload=True,
            with_vectors=False,
        )

        return [point.payload for point in results[0]]

    def delete_candidate(self, candidate_id: str) -> None:
        """Delete all chunks for a candidate."""
        self.client.delete(
            collection_name=self.settings.candidate_chunks_collection,
            points_selector=models.FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="candidate_id",
                            match=MatchValue(value=candidate_id),
                        )
                    ]
                )
            ),
        )
        logger.info(f"Deleted all chunks for candidate {candidate_id}")

    # =========================================================================
    # HYBRID SEARCH
    # =========================================================================

    def hybrid_search(
        self,
        query_embedding: List[float],
        filters: Optional[FilterIntent] = None,
        top_k: int = 20,
        score_threshold: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search combining semantic similarity with payload filters.

        CRITICAL DESIGN: Filters are SOFT by default.
        - We use 'should' clauses to BOOST matching candidates
        - We do NOT use 'must' clauses (which would hard-exclude)
        - Hard exclusion only for explicit exclude lists

        This ensures qualified candidates aren't excluded due to:
        - Imperfect metadata extraction
        - Different terminology (e.g., "Python" vs "python3")
        - Missing fields
        """

        # Build filter with soft constraints (should clauses)
        filter_conditions = self._build_soft_filter(filters)

        # Perform search
        results = self.client.search(
            collection_name=self.settings.candidate_chunks_collection,
            query_vector=query_embedding,
            query_filter=filter_conditions,
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
        )

        return [
            {
                "id": result.id,
                "score": result.score,
                "payload": result.payload,
            }
            for result in results
        ]

    def hybrid_search_with_candidate_diversity(
        self,
        query_embedding: List[float],
        filters: Optional[FilterIntent] = None,
        min_unique_candidates: int = 20,
        max_chunks_per_candidate: int = 5,
        score_threshold: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search ensuring minimum diversity of unique candidates.

        This method fetches chunks in batches and ensures we have enough
        unique candidates represented, preventing a few candidates with
        many chunks from dominating the results.

        Args:
            query_embedding: Query vector for similarity search
            filters: Optional soft filter constraints
            min_unique_candidates: Minimum number of unique candidates to retrieve
            max_chunks_per_candidate: Maximum chunks to keep per candidate
            score_threshold: Minimum similarity score

        Returns:
            List of chunk results with candidate diversity guaranteed
        """
        filter_conditions = self._build_soft_filter(filters)

        # Start with a larger batch to get diversity
        batch_size = min_unique_candidates * 3
        max_iterations = 5
        all_results = []
        seen_candidates = {}  # candidate_id -> list of (score, result)
        offset = 0

        for _ in range(max_iterations):
            results = self.client.search(
                collection_name=self.settings.candidate_chunks_collection,
                query_vector=query_embedding,
                query_filter=filter_conditions,
                limit=batch_size,
                offset=offset,
                score_threshold=score_threshold,
                with_payload=True,
            )

            if not results:
                break

            for result in results:
                candidate_id = result.payload.get("candidate_id")
                if candidate_id:
                    if candidate_id not in seen_candidates:
                        seen_candidates[candidate_id] = []
                    seen_candidates[candidate_id].append(
                        {
                            "id": result.id,
                            "score": result.score,
                            "payload": result.payload,
                        }
                    )

            # Check if we have enough unique candidates
            if len(seen_candidates) >= min_unique_candidates:
                break

            offset += batch_size

        # Now aggregate results: keep top chunks per candidate
        for candidate_id, chunks in seen_candidates.items():
            # Sort by score descending and keep top N
            sorted_chunks = sorted(chunks, key=lambda x: x["score"], reverse=True)
            all_results.extend(sorted_chunks[:max_chunks_per_candidate])

        # Sort all results by score
        all_results.sort(key=lambda x: x["score"], reverse=True)

        logger.info(
            f"Diversity search: {len(all_results)} chunks from {len(seen_candidates)} unique candidates"
        )

        return all_results

    def _build_soft_filter(self, filters: Optional[FilterIntent]) -> Optional[Filter]:
        """
        Build Qdrant filter with soft constraints.

        Soft filtering strategy:
        1. Skills: Use 'should' with MatchAny - boosts but doesn't exclude
        2. Experience: Use range filter as 'should' condition
        3. Role: Use 'should' with MatchAny
        4. Hard exclusions: Only apply 'must_not' for explicit exclusions
        """
        if filters is None:
            return None

        should_conditions = []
        must_not_conditions = []

        # Soft skill matching - boost candidates with matching skills
        all_skills = filters.required_skills + filters.preferred_skills
        if all_skills:
            # Normalize skills to lowercase
            normalized_skills = [s.lower().strip() for s in all_skills]
            should_conditions.append(
                FieldCondition(
                    key="skills",
                    match=MatchAny(any=normalized_skills),
                )
            )

        # Soft experience filter
        if filters.min_experience_years is not None:
            # Use a slightly lower threshold to avoid excluding edge cases
            adjusted_min = max(0, filters.min_experience_years - 0.5)
            should_conditions.append(
                FieldCondition(
                    key="experience_years",
                    range=Range(gte=adjusted_min),
                )
            )

        if filters.max_experience_years is not None:
            should_conditions.append(
                FieldCondition(
                    key="experience_years",
                    range=Range(lte=filters.max_experience_years + 0.5),
                )
            )

        # Soft role category matching
        if filters.role_categories:
            role_values = [r.value for r in filters.role_categories]
            should_conditions.append(
                FieldCondition(
                    key="role_category",
                    match=MatchAny(any=role_values),
                )
            )

        # Location filter (soft)
        if filters.locations:
            normalized_locations = [loc.lower().strip() for loc in filters.locations]
            should_conditions.append(
                FieldCondition(
                    key="location",
                    match=MatchAny(any=normalized_locations),
                )
            )

        # Remote filter (soft)
        if filters.remote_ok is not None and filters.remote_ok:
            should_conditions.append(
                FieldCondition(
                    key="is_remote",
                    match=MatchValue(value=True),
                )
            )

        # HARD exclusions - only when explicitly requested
        if filters.hard_exclude_skills:
            normalized_excludes = [
                s.lower().strip() for s in filters.hard_exclude_skills
            ]
            must_not_conditions.append(
                FieldCondition(
                    key="skills",
                    match=MatchAny(any=normalized_excludes),
                )
            )

        # Build final filter
        if not should_conditions and not must_not_conditions:
            return None

        return Filter(
            should=should_conditions if should_conditions else None,
            must_not=must_not_conditions if must_not_conditions else None,
        )

    # =========================================================================
    # RECRUITER MEMORY OPERATIONS
    # =========================================================================

    def store_recruiter_query(
        self,
        memory_entry: RecruiterMemoryEntry,
        embedding: List[float],
    ) -> None:
        """Store a recruiter query in memory for session continuity."""
        payload = {
            "session_id": memory_entry.session_id,
            "query_text": memory_entry.query_text,
            "query_type": memory_entry.query_type,
            "extracted_skills": memory_entry.extracted_filters.required_skills
            + memory_entry.extracted_filters.preferred_skills,
            "min_experience": memory_entry.extracted_filters.min_experience_years,
            "role_categories": [
                r.value for r in memory_entry.extracted_filters.role_categories
            ],
            "timestamp": memory_entry.timestamp.isoformat(),
            "refinements": memory_entry.refinements,
        }

        self.client.upsert(
            collection_name=self.settings.recruiter_memory_collection,
            points=[
                PointStruct(
                    id=memory_entry.id,
                    vector=embedding,
                    payload=payload,
                )
            ],
        )

    def get_session_memory(
        self,
        session_id: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Retrieve memory entries for a session."""
        results = self.client.scroll(
            collection_name=self.settings.recruiter_memory_collection,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="session_id",
                        match=MatchValue(value=session_id),
                    )
                ]
            ),
            limit=limit,
            with_payload=True,
            with_vectors=True,
        )

        return [
            {
                "id": point.id,
                "payload": point.payload,
                "vector": point.vector,
            }
            for point in results[0]
        ]

    def search_similar_queries(
        self,
        query_embedding: List[float],
        session_id: Optional[str] = None,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """Find similar past queries, optionally within a session."""
        filter_cond = None
        if session_id:
            filter_cond = Filter(
                must=[
                    FieldCondition(
                        key="session_id",
                        match=MatchValue(value=session_id),
                    )
                ]
            )

        results = self.client.search(
            collection_name=self.settings.recruiter_memory_collection,
            query_vector=query_embedding,
            query_filter=filter_cond,
            limit=top_k,
            with_payload=True,
        )

        return [
            {
                "id": result.id,
                "score": result.score,
                "payload": result.payload,
            }
            for result in results
        ]

    # =========================================================================
    # STATS AND UTILITIES
    # =========================================================================

    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about collections."""
        stats = {}

        for collection_name in [
            self.settings.candidate_chunks_collection,
            self.settings.recruiter_memory_collection,
        ]:
            try:
                info = self.client.get_collection(collection_name)
                stats[collection_name] = {
                    "points_count": info.points_count,
                    "vectors_count": info.vectors_count,
                    "status": info.status.value,
                }
            except Exception as e:
                stats[collection_name] = {"error": str(e)}

        return stats


# Global instance
_qdrant_service: Optional[QdrantService] = None


def get_qdrant_service() -> QdrantService:
    """Get or create the global Qdrant service instance."""
    global _qdrant_service
    if _qdrant_service is None:
        _qdrant_service = QdrantService()
    return _qdrant_service
