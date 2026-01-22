"""
Scoring and ranking service for transparent candidate evaluation.

DESIGN DECISIONS:
1. Composite scoring with explicit weights
2. All components are explainable
3. No protected attributes in scoring
4. Scores are normalized (0-1)
"""

import logging
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict

from app.config import get_settings
from app.models import (
    ScoreBreakdown,
    CandidateMatch,
    MatchEvidence,
    FilterIntent,
    ExtractedMetadata,
    ChunkType,
    RoleCategory,
)

logger = logging.getLogger(__name__)


class ScoringService:
    """
    Service for computing transparent, explainable candidate scores.
    """

    def __init__(self):
        self.settings = get_settings()

    def score_candidates(
        self,
        search_results: List[Dict[str, Any]],
        filters: FilterIntent,
        query: str,
    ) -> List[CandidateMatch]:
        """
        Score and rank candidates based on search results.

        Args:
            search_results: Raw results from Qdrant hybrid search
            filters: Extracted filter intent
            query: Original query text

        Returns:
            List of CandidateMatch with full scoring breakdown
        """
        # Group chunks by candidate
        candidate_chunks = self._group_by_candidate(search_results)

        # Score each candidate
        scored_candidates = []
        for candidate_id, chunks in candidate_chunks.items():
            score_breakdown = self._compute_score(chunks, filters)
            evidence = self._extract_evidence(chunks, filters, query)
            metadata = self._aggregate_chunk_metadata(chunks)

            # Determine which filters matched/missed
            filters_matched, filters_missed = self._evaluate_filters(metadata, filters)

            # Get candidate name if available
            candidate_name = self._extract_candidate_name(chunks)

            scored_candidates.append(
                CandidateMatch(
                    candidate_id=candidate_id,
                    candidate_name=candidate_name,
                    score=score_breakdown,
                    rank=0,  # Will be set after sorting
                    evidence=evidence,
                    extracted_metadata=metadata,
                    filters_matched=filters_matched,
                    filters_missed=filters_missed,
                )
            )

        # Sort by total score and assign ranks
        scored_candidates.sort(key=lambda x: x.score.total_score, reverse=True)
        for i, candidate in enumerate(scored_candidates):
            candidate.rank = i + 1

        return scored_candidates

    def _group_by_candidate(
        self,
        results: List[Dict[str, Any]],
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Group search results by candidate ID."""
        grouped = defaultdict(list)
        for result in results:
            candidate_id = result["payload"].get("candidate_id")
            if candidate_id:
                grouped[candidate_id].append(result)
        return dict(grouped)

    def _compute_score(
        self,
        chunks: List[Dict[str, Any]],
        filters: FilterIntent,
    ) -> ScoreBreakdown:
        """
        Compute comprehensive score breakdown for a candidate.

        For semantic similarity, we use a weighted combination:
        - MAX score (best matching chunk) contributes 70%
        - AVG score (overall relevance) contributes 30%
        This rewards candidates with highly relevant sections while
        still considering overall profile relevance.
        """
        # 1. Semantic similarity - use weighted max + avg for better representation
        semantic_scores = [chunk["score"] for chunk in chunks]
        if semantic_scores:
            max_score = max(semantic_scores)
            avg_score = sum(semantic_scores) / len(semantic_scores)
            # Weighted: 70% best chunk, 30% average (rewards highly relevant sections)
            semantic_similarity = 0.7 * max_score + 0.3 * avg_score
        else:
            semantic_similarity = 0.0

        # Normalize to 0-1 (Qdrant cosine similarity can be -1 to 1)
        semantic_similarity = (semantic_similarity + 1) / 2

        # 2. Skills match
        candidate_skills = self._get_candidate_skills(chunks)
        skills_match, matched_skills, missing_skills = self._compute_skills_match(
            candidate_skills, filters
        )

        # 3. Experience fit
        candidate_experience = self._get_candidate_experience(chunks)
        experience_fit = self._compute_experience_fit(candidate_experience, filters)

        # 4. Role match
        candidate_role = self._get_candidate_role(chunks)
        role_match = self._compute_role_match(candidate_role, filters)

        # 5. Availability (location/remote)
        availability_score = self._compute_availability_score(chunks, filters)

        # 6. Feedback score (placeholder - would come from recruiter feedback)
        feedback_score = 0.5  # Neutral default

        # Compute weighted total
        total_score = (
            self.settings.weight_semantic * semantic_similarity
            + self.settings.weight_skills * skills_match
            + self.settings.weight_experience * experience_fit
            + self.settings.weight_role * role_match
            + self.settings.weight_availability * availability_score
            + self.settings.weight_feedback * feedback_score
        )

        # Generate explanation
        explanation = self._generate_explanation(
            semantic_similarity,
            skills_match,
            experience_fit,
            role_match,
            matched_skills,
            missing_skills,
            candidate_experience,
        )

        return ScoreBreakdown(
            semantic_similarity=semantic_similarity,
            skills_match=skills_match,
            experience_fit=experience_fit,
            role_match=role_match,
            availability_score=availability_score,
            feedback_score=feedback_score,
            total_score=total_score,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            score_explanation=explanation,
        )

    def _get_candidate_skills(self, chunks: List[Dict[str, Any]]) -> Set[str]:
        """Extract all skills from candidate chunks."""
        skills = set()
        for chunk in chunks:
            chunk_skills = chunk["payload"].get("skills", [])
            skills.update(s.lower() for s in chunk_skills)
        return skills

    def _get_candidate_experience(
        self, chunks: List[Dict[str, Any]]
    ) -> Optional[float]:
        """Get candidate's experience years."""
        for chunk in chunks:
            exp = chunk["payload"].get("experience_years")
            if exp is not None:
                return exp
        return None

    def _get_candidate_role(self, chunks: List[Dict[str, Any]]) -> Optional[str]:
        """Get candidate's role category."""
        for chunk in chunks:
            role = chunk["payload"].get("role_category")
            if role:
                return role
        return None

    def _compute_skills_match(
        self,
        candidate_skills: Set[str],
        filters: FilterIntent,
    ) -> tuple:
        """
        Compute skills match score.
        Returns (score, matched_skills, missing_skills)
        """
        all_required = set(s.lower() for s in filters.required_skills)
        all_preferred = set(s.lower() for s in filters.preferred_skills)
        all_desired = all_required | all_preferred

        if not all_desired:
            return 0.5, [], []  # Neutral if no skills specified

        matched = candidate_skills & all_desired
        missing = all_required - candidate_skills

        # Score: required skills count more
        required_match_count = len(candidate_skills & all_required)
        preferred_match_count = len(candidate_skills & all_preferred)

        required_weight = 0.7
        preferred_weight = 0.3

        if all_required:
            required_score = required_match_count / len(all_required)
        else:
            required_score = 1.0

        if all_preferred:
            preferred_score = preferred_match_count / len(all_preferred)
        else:
            preferred_score = 1.0

        score = required_weight * required_score + preferred_weight * preferred_score

        return score, list(matched), list(missing)

    def _compute_experience_fit(
        self,
        candidate_experience: Optional[float],
        filters: FilterIntent,
    ) -> float:
        """
        Compute experience fit score.
        Uses a soft scoring approach that doesn't harshly penalize edge cases.
        """
        if candidate_experience is None:
            return 0.5  # Neutral if unknown

        min_exp = filters.min_experience_years
        max_exp = filters.max_experience_years

        if min_exp is None and max_exp is None:
            return 0.7  # Slightly positive if no requirement

        # Compute fit
        if min_exp is not None and max_exp is not None:
            # Range specified
            if min_exp <= candidate_experience <= max_exp:
                return 1.0
            elif candidate_experience < min_exp:
                # Below minimum - soft penalty
                gap = min_exp - candidate_experience
                return max(0.2, 1.0 - (gap / min_exp) * 0.5)
            else:
                # Above maximum - slight soft penalty (overqualified)
                gap = candidate_experience - max_exp
                return max(0.5, 1.0 - (gap / max_exp) * 0.3)

        elif min_exp is not None:
            # Only minimum specified
            if candidate_experience >= min_exp:
                return 1.0
            else:
                gap = min_exp - candidate_experience
                return max(0.2, 1.0 - (gap / min_exp) * 0.5)

        else:
            # Only maximum specified
            if candidate_experience <= max_exp:
                return 1.0
            else:
                gap = candidate_experience - max_exp
                return max(0.5, 1.0 - (gap / max_exp) * 0.3)

    def _compute_role_match(
        self,
        candidate_role: Optional[str],
        filters: FilterIntent,
    ) -> float:
        """Compute role category match score."""
        if not filters.role_categories:
            return 0.5  # Neutral if no role specified

        if candidate_role is None:
            return 0.4  # Slight penalty if role unknown

        filter_roles = [r.value for r in filters.role_categories]

        if candidate_role in filter_roles:
            return 1.0

        # Check for related roles
        role_relations = {
            "engineering": ["data_science", "devops"],
            "data_science": ["engineering", "product"],
            "product": ["design", "engineering"],
            "design": ["product", "marketing"],
        }

        related = role_relations.get(candidate_role, [])
        for filter_role in filter_roles:
            if filter_role in related:
                return 0.7  # Partial match for related roles

        return 0.3  # Low score for unrelated role

    def _compute_availability_score(
        self,
        chunks: List[Dict[str, Any]],
        filters: FilterIntent,
    ) -> float:
        """Compute availability/location fit score."""
        # Check remote preference
        candidate_remote = None
        candidate_location = None

        for chunk in chunks:
            if chunk["payload"].get("is_remote") is not None:
                candidate_remote = chunk["payload"]["is_remote"]
            if chunk["payload"].get("location"):
                candidate_location = chunk["payload"]["location"]

        # If remote is preferred and candidate is remote-friendly
        if filters.remote_ok:
            if candidate_remote:
                return 1.0
            return 0.7  # Unknown, neutral-positive

        # If locations specified
        if filters.locations:
            if candidate_location:
                for loc in filters.locations:
                    if loc.lower() in candidate_location.lower():
                        return 1.0
                return 0.4  # Location mismatch
            return 0.5  # Unknown location

        return 0.5  # Neutral

    def _extract_evidence(
        self,
        chunks: List[Dict[str, Any]],
        filters: FilterIntent,
        query: str,
    ) -> List[MatchEvidence]:
        """
        Extract evidence snippets showing why candidate matched.
        """
        evidence = []

        # Sort chunks by relevance score
        sorted_chunks = sorted(chunks, key=lambda x: x["score"], reverse=True)

        # Get top 3 most relevant chunks
        for chunk in sorted_chunks[:3]:
            text = chunk["payload"].get("text", "")
            chunk_type = chunk["payload"].get("chunk_type", "other")

            # Find matched terms
            matched_terms = []
            all_skills = filters.required_skills + filters.preferred_skills
            for skill in all_skills:
                if skill.lower() in text.lower():
                    matched_terms.append(skill)

            # Truncate text if too long
            if len(text) > 500:
                text = text[:500] + "..."

            evidence.append(
                MatchEvidence(
                    chunk_text=text,
                    chunk_type=ChunkType(chunk_type)
                    if chunk_type in [e.value for e in ChunkType]
                    else ChunkType.OTHER,
                    relevance_score=chunk["score"],
                    matched_terms=matched_terms,
                )
            )

        return evidence

    def _aggregate_chunk_metadata(
        self,
        chunks: List[Dict[str, Any]],
    ) -> ExtractedMetadata:
        """Aggregate metadata from all chunks."""
        all_skills = set()
        experience = None
        role = None
        location = None
        is_remote = None
        companies = set()
        education = None

        for chunk in chunks:
            payload = chunk["payload"]

            skills = payload.get("skills", [])
            all_skills.update(skills)

            if payload.get("experience_years") and experience is None:
                experience = payload["experience_years"]

            if payload.get("role_category") and role is None:
                role = payload["role_category"]

            if payload.get("location") and location is None:
                location = payload["location"]

            if payload.get("is_remote") is not None and is_remote is None:
                is_remote = payload["is_remote"]

            if payload.get("companies"):
                companies.update(payload["companies"])

            if payload.get("education_level") and education is None:
                education = payload["education_level"]

        return ExtractedMetadata(
            skills=list(all_skills),
            experience_years=experience,
            role_category=RoleCategory(role)
            if role and role in [e.value for e in RoleCategory]
            else None,
            location=location,
            is_remote=is_remote,
            companies=list(companies),
            education_level=education,
        )

    def _evaluate_filters(
        self,
        metadata: ExtractedMetadata,
        filters: FilterIntent,
    ) -> tuple:
        """Evaluate which filters were matched/missed."""
        matched = []
        missed = []

        # Check skills
        candidate_skills = set(s.lower() for s in metadata.skills)
        for skill in filters.required_skills:
            if skill.lower() in candidate_skills:
                matched.append(f"Has skill: {skill}")
            else:
                missed.append(f"Missing skill: {skill}")

        # Check experience
        if filters.min_experience_years and metadata.experience_years:
            if metadata.experience_years >= filters.min_experience_years:
                matched.append(f"Experience: {metadata.experience_years}+ years")
            else:
                missed.append(
                    f"Below min experience: {metadata.experience_years} < {filters.min_experience_years}"
                )

        # Check role
        if filters.role_categories and metadata.role_category:
            if metadata.role_category in filters.role_categories:
                matched.append(f"Role match: {metadata.role_category.value}")
            else:
                missed.append(f"Different role: {metadata.role_category.value}")

        return matched, missed

    def _extract_candidate_name(self, chunks: List[Dict[str, Any]]) -> Optional[str]:
        """Try to extract candidate name from chunks.

        First checks if name is stored directly in payload (preferred),
        then falls back to text extraction from first chunk.
        """
        # First, check if name is stored in any chunk's payload
        for chunk in chunks:
            candidate_name = chunk["payload"].get("candidate_name")
            if candidate_name:
                return candidate_name

        # Fallback: extract from first chunk text
        for chunk in chunks:
            # Look in first chunk which often contains header
            if chunk["payload"].get("chunk_index", 99) == 0:
                text = chunk["payload"].get("text", "")

                # First try splitting by newline (if preserved)
                lines = text.split("\n")[:3]
                for line in lines:
                    line = line.strip()
                    if line and len(line) < 50 and "@" not in line:
                        words = line.split()
                        if 2 <= len(words) <= 4:
                            if all(word[0].isupper() for word in words if word):
                                return line

                # If no newlines, try to extract name before email pattern
                # Pattern: "FirstName LastName email@..." at start of text
                import re

                name_email_match = re.match(
                    r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+[a-zA-Z0-9._%+-]+@", text
                )
                if name_email_match:
                    return name_email_match.group(1).strip()

                # Try to find capitalized words at the start (before any lowercase sentence)
                words = text.split()
                name_words = []
                for word in words[:5]:  # Check first 5 words
                    # Stop if we hit an email or lowercase word
                    if "@" in word or (word and word[0].islower()):
                        break
                    if word and word[0].isupper() and word.isalpha():
                        name_words.append(word)

                if 2 <= len(name_words) <= 4:
                    return " ".join(name_words)

        return None

    def _generate_explanation(
        self,
        semantic: float,
        skills: float,
        experience: float,
        role: float,
        matched_skills: List[str],
        missing_skills: List[str],
        experience_years: Optional[float],
    ) -> str:
        """Generate human-readable score explanation."""
        parts = []

        if semantic > 0.7:
            parts.append("Strong semantic match with job description")
        elif semantic > 0.5:
            parts.append("Moderate semantic relevance")

        if skills > 0.8 and matched_skills:
            parts.append(f"Excellent skill alignment ({len(matched_skills)} matched)")
        elif skills > 0.5:
            parts.append(f"Partial skill match")

        if missing_skills:
            parts.append(f"Missing: {', '.join(missing_skills[:3])}")

        if experience > 0.8 and experience_years:
            parts.append(f"Good experience fit ({experience_years} years)")

        if role > 0.8:
            parts.append("Role category matches")

        return ". ".join(parts) if parts else "Based on overall profile relevance."


# Global instance
_scoring_service = None


def get_scoring_service() -> ScoringService:
    """Get or create the global scoring service instance."""
    global _scoring_service
    if _scoring_service is None:
        _scoring_service = ScoringService()
    return _scoring_service
