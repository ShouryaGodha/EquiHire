"""
Main search service that orchestrates hybrid search, scoring, and memory.

This is the primary entry point for search operations.
"""

import logging
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
import time

from app.config import get_settings
from app.models import (
    SearchRequest,
    SearchResponse,
    FollowUpRequest,
    FilterIntent,
    RecruiterMemoryEntry,
    CandidateMatch,
)
from app.services.qdrant_service import get_qdrant_service
from app.services.embedding_service import get_embedding_service
from app.services.query_processor import get_query_processor
from app.services.scoring import get_scoring_service

logger = logging.getLogger(__name__)


class SearchService:
    """
    Main search service for candidate retrieval.

    Orchestrates:
    1. Query processing and filter extraction
    2. Hybrid vector + payload search
    3. Scoring and ranking
    4. Memory storage for follow-ups
    5. Reranking (optional)
    """

    def __init__(self):
        self.settings = get_settings()
        self.qdrant = get_qdrant_service()
        self.embedder = get_embedding_service()
        self.query_processor = get_query_processor()
        self.scorer = get_scoring_service()

    def search(self, request: SearchRequest) -> SearchResponse:
        """
        Execute a candidate search.

        Steps:
        1. Process query to extract filters
        2. Generate query embedding
        3. Combine with session memory if available
        4. Execute hybrid search
        5. Score and rank candidates
        6. Store query in memory
        7. Return explainable results
        """
        start_time = time.time()

        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())

        # Process query to extract filters
        if request.explicit_filters:
            filters = request.explicit_filters
            clean_query = request.query
        else:
            clean_query, filters = self.query_processor.process_query(request.query)

        logger.info(
            f"Search query: '{request.query}', extracted {len(filters.required_skills)} required skills"
        )

        # Generate query embedding
        query_embedding = self.embedder.embed_text(clean_query)

        # Combine with memory if enabled and session exists
        if request.use_memory and request.session_id:
            query_embedding = self._enhance_with_memory(
                query_embedding, session_id, filters
            )

        # Execute hybrid search
        raw_results = self.qdrant.hybrid_search(
            query_embedding=query_embedding,
            filters=filters,
            top_k=request.top_k * 3,  # Get more for scoring
        )

        logger.info(f"Retrieved {len(raw_results)} chunks from Qdrant")

        # Score and rank candidates
        scored_candidates = self.scorer.score_candidates(
            search_results=raw_results,
            filters=filters,
            query=request.query,
        )

        # Optional: Rerank top candidates
        if request.apply_reranking and self.settings.use_reranker:
            scored_candidates = self._rerank_candidates(
                candidates=scored_candidates,
                query=request.query,
                top_k=request.top_k,
            )

        # Limit to requested count
        scored_candidates = scored_candidates[: request.top_k]

        # Store query in memory
        self._store_in_memory(
            session_id=session_id,
            query=request.query,
            filters=filters,
            query_embedding=query_embedding,
        )

        # Calculate search time
        search_time_ms = (time.time() - start_time) * 1000

        # Build filters applied list
        filters_applied = self._build_filters_applied_list(filters)

        # Generate explanation
        explanation = self._generate_search_explanation(
            query=request.query,
            filters=filters,
            num_results=len(scored_candidates),
            total_scanned=len(raw_results),
        )

        return SearchResponse(
            session_id=session_id,
            query=request.query,
            extracted_filters=filters,
            matches=scored_candidates,
            total_candidates_scanned=len(raw_results),
            search_time_ms=search_time_ms,
            filters_applied=filters_applied,
            explanation=explanation,
        )

    def follow_up(self, request: FollowUpRequest) -> SearchResponse:
        """
        Handle a follow-up question that refines the search.

        Follow-ups:
        1. Are treated as additional semantic queries
        2. May introduce new soft filters
        3. Influence ranking within session context
        """
        # Get session memory to understand context
        memory = self.qdrant.get_session_memory(request.session_id)

        if not memory:
            # No context - treat as new search
            logger.info(
                f"No memory found for session {request.session_id}, treating as new search"
            )
            return self.search(
                SearchRequest(
                    query=request.question,
                    session_id=request.session_id,
                )
            )

        # Extract filters from follow-up
        _, new_filters = self.query_processor.process_query(request.question)

        # Handle explicit adjustments
        if request.add_skills:
            new_filters.required_skills.extend(request.add_skills)
        if request.remove_skills:
            new_filters.hard_exclude_skills.extend(request.remove_skills)
        if request.adjust_experience:
            new_filters.min_experience_years = request.adjust_experience

        # Get previous filters from most recent memory entry
        previous_entry = max(memory, key=lambda x: x["payload"].get("timestamp", ""))
        previous_skills = previous_entry["payload"].get("extracted_skills", [])
        previous_exp = previous_entry["payload"].get("min_experience")
        previous_roles = previous_entry["payload"].get("role_categories", [])

        # Create merged filters
        from app.models import RoleCategory

        base_filters = FilterIntent(
            required_skills=previous_skills,
            min_experience_years=previous_exp,
            role_categories=[RoleCategory(r) for r in previous_roles if r],
        )
        merged_filters = self.query_processor.merge_filters(base_filters, new_filters)

        # Execute search with merged context
        return self.search(
            SearchRequest(
                query=request.question,
                session_id=request.session_id,
                explicit_filters=merged_filters,
                use_memory=True,
            )
        )

    def _enhance_with_memory(
        self,
        query_embedding: List[float],
        session_id: str,
        current_filters: FilterIntent,
    ) -> List[float]:
        """
        Enhance query embedding with session memory.

        This allows follow-ups to influence the search direction
        based on the recruiter's evolving preferences.
        """
        # Get memory entries for session
        memory = self.qdrant.get_session_memory(session_id, limit=5)

        if not memory:
            return query_embedding

        # Collect memory embeddings
        memory_embeddings = []
        memory_weights = []

        for i, entry in enumerate(memory):
            if entry.get("vector"):
                memory_embeddings.append(entry["vector"])
                # More recent entries get higher weight
                memory_weights.append(0.5 ** (i + 1))  # Decay: 0.5, 0.25, 0.125, ...

        if not memory_embeddings:
            return query_embedding

        # Normalize weights
        total_weight = sum(memory_weights) + 1.0  # +1 for current query
        current_weight = 1.0 / total_weight
        memory_weights = [w / total_weight for w in memory_weights]

        # Combine embeddings
        all_embeddings = [query_embedding] + memory_embeddings
        all_weights = [current_weight] + memory_weights

        combined = self.embedder.combine_embeddings(all_embeddings, all_weights)

        logger.info(f"Enhanced query with {len(memory_embeddings)} memory entries")

        return combined

    def _rerank_candidates(
        self,
        candidates: List[CandidateMatch],
        query: str,
        top_k: int,
    ) -> List[CandidateMatch]:
        """
        Rerank top candidates using cross-encoder for more accurate ranking.
        """
        if not candidates:
            return candidates

        # Get representative text for each candidate
        candidate_texts = []
        for candidate in candidates:
            # Use top evidence as representative text
            if candidate.evidence:
                text = " ".join(e.chunk_text[:200] for e in candidate.evidence[:2])
            else:
                text = ""
            candidate_texts.append(text)

        # Rerank
        reranked_indices = self.embedder.rerank(
            query=query,
            documents=candidate_texts,
            top_k=top_k,
        )

        # Reorder candidates
        reranked = []
        for idx, score in reranked_indices:
            candidate = candidates[idx]
            # Update score to factor in reranking
            candidate.score.semantic_similarity = (
                candidate.score.semantic_similarity * 0.7
                + (score + 10) / 20 * 0.3  # Normalize cross-encoder score roughly
            )
            # Recalculate total
            candidate.score.total_score = (
                self.settings.weight_semantic * candidate.score.semantic_similarity
                + self.settings.weight_skills * candidate.score.skills_match
                + self.settings.weight_experience * candidate.score.experience_fit
                + self.settings.weight_role * candidate.score.role_match
                + self.settings.weight_availability * candidate.score.availability_score
                + self.settings.weight_feedback * candidate.score.feedback_score
            )
            reranked.append(candidate)

        # Re-sort and re-rank
        reranked.sort(key=lambda x: x.score.total_score, reverse=True)
        for i, candidate in enumerate(reranked):
            candidate.rank = i + 1

        return reranked

    def _store_in_memory(
        self,
        session_id: str,
        query: str,
        filters: FilterIntent,
        query_embedding: List[float],
    ) -> None:
        """Store query in recruiter memory for session continuity."""
        memory_entry = RecruiterMemoryEntry(
            session_id=session_id,
            query_text=query,
            query_type="search",
            extracted_filters=filters,
        )

        self.qdrant.store_recruiter_query(memory_entry, query_embedding)
        logger.info(f"Stored query in memory for session {session_id}")

    def _build_filters_applied_list(self, filters: FilterIntent) -> List[str]:
        """Build human-readable list of applied filters."""
        applied = []

        if filters.required_skills:
            applied.append(f"Required skills: {', '.join(filters.required_skills)}")

        if filters.preferred_skills:
            applied.append(f"Preferred skills: {', '.join(filters.preferred_skills)}")

        if filters.min_experience_years:
            applied.append(f"Min experience: {filters.min_experience_years}+ years")

        if filters.max_experience_years:
            applied.append(f"Max experience: {filters.max_experience_years} years")

        if filters.role_categories:
            roles = [r.value for r in filters.role_categories]
            applied.append(f"Role categories: {', '.join(roles)}")

        if filters.locations:
            applied.append(f"Locations: {', '.join(filters.locations)}")

        if filters.remote_ok:
            applied.append("Remote: Yes")

        if filters.hard_exclude_skills:
            applied.append(f"Excluded: {', '.join(filters.hard_exclude_skills)}")

        return applied

    def _generate_search_explanation(
        self,
        query: str,
        filters: FilterIntent,
        num_results: int,
        total_scanned: int,
    ) -> str:
        """Generate explanation of how search was performed."""
        parts = [
            f'Searched for candidates matching: "{query}".',
            f"Scanned {total_scanned} resume chunks and found {num_results} matching candidates.",
        ]

        if filters.required_skills or filters.preferred_skills:
            skills = filters.required_skills + filters.preferred_skills
            parts.append(f"Applied soft skill filters for: {', '.join(skills[:5])}.")

        if filters.min_experience_years:
            parts.append(
                f"Prioritized candidates with {filters.min_experience_years}+ years experience."
            )

        parts.append(
            "Results are ranked by a composite score combining semantic relevance, skill match, and experience fit."
        )
        parts.append(
            "All filter matches are SOFT - no candidates were hard-excluded based on missing metadata."
        )

        return " ".join(parts)


# Global instance
_search_service = None


def get_search_service() -> SearchService:
    """Get or create the global search service instance."""
    global _search_service
    if _search_service is None:
        _search_service = SearchService()
    return _search_service
