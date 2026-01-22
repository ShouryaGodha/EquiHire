"""
Query processing service for extracting search intent and filters.

Converts natural language queries into:
1. Semantic embeddings for vector search
2. Filter intents for payload filtering

DESIGN DECISIONS:
1. Heuristic-based filter extraction (no LLM dependency required)
2. Soft interpretation - uncertain extractions become soft filters
3. Explicit keywords trigger hard constraints
"""

import re
import logging
from typing import List, Optional, Tuple

from app.models import FilterIntent, RoleCategory
from app.services.text_processor import SKILL_PATTERNS, ROLE_KEYWORDS

logger = logging.getLogger(__name__)


class QueryProcessor:
    """
    Process recruiter queries to extract semantic intent and filters.
    """

    # Patterns for experience extraction
    EXPERIENCE_PATTERNS = [
        r"(\d+)\+?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?",
        r"(?:at least|minimum|min)\s*(\d+)\s*(?:years?|yrs?)",
        r"(?:experience|exp)[\:\s]*(\d+)\+?\s*(?:years?|yrs?)",
        r"(\d+)\s*to\s*(\d+)\s*(?:years?|yrs?)",
    ]

    # Keywords indicating hard requirements
    HARD_REQUIREMENT_KEYWORDS = [
        "must have",
        "required",
        "mandatory",
        "essential",
        "need",
        "needs to have",
        "should have",
    ]

    # Keywords indicating preferences
    PREFERENCE_KEYWORDS = [
        "prefer",
        "ideally",
        "nice to have",
        "bonus",
        "plus",
        "would be great",
        "optional",
    ]

    # Keywords for exclusion
    EXCLUSION_KEYWORDS = [
        "not",
        "no",
        "without",
        "exclude",
        "avoid",
        "don't want",
        "shouldn't have",
    ]

    # Location patterns
    LOCATION_PATTERNS = [
        r"(?:in|at|from|based in|located in)\s+([A-Za-z\s,]+?)(?:\s*,|\s*\.|$|\s+with|\s+and)",
        r"([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\s*(?:area|region|based)?",
    ]

    def process_query(self, query: str) -> Tuple[str, FilterIntent]:
        """
        Process a recruiter query to extract filters and clean query.

        Args:
            query: Natural language job description or search query

        Returns:
            Tuple of (clean_query_for_embedding, extracted_filters)
        """
        query_lower = query.lower()

        # Extract skills
        required_skills, preferred_skills = self._extract_skills(query, query_lower)

        # Extract experience requirements
        min_exp, max_exp = self._extract_experience(query_lower)

        # Extract role categories
        role_categories = self._extract_role_categories(query_lower)

        # Extract locations
        locations = self._extract_locations(query)

        # Check for remote
        remote_ok = self._check_remote_preference(query_lower)

        # Extract exclusions
        exclusions = self._extract_exclusions(query_lower)

        # Build filter intent
        filters = FilterIntent(
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            min_experience_years=min_exp,
            max_experience_years=max_exp,
            role_categories=role_categories,
            locations=locations,
            remote_ok=remote_ok,
            hard_exclude_skills=exclusions,
            raw_query=query,
            extraction_confidence=self._estimate_confidence(
                required_skills, preferred_skills, min_exp, role_categories
            ),
        )

        # Clean query for embedding (remove explicit filter language)
        clean_query = self._clean_query_for_embedding(query)

        logger.info(
            f"Extracted filters: skills={required_skills + preferred_skills}, exp={min_exp}-{max_exp}, roles={role_categories}"
        )

        return clean_query, filters

    def _extract_skills(
        self,
        query: str,
        query_lower: str,
    ) -> Tuple[List[str], List[str]]:
        """
        Extract required and preferred skills from query.
        """
        required = []
        preferred = []

        # Find all skills mentioned
        found_skills = []
        for skill in SKILL_PATTERNS:
            pattern = rf"\b{re.escape(skill)}\b"
            if re.search(pattern, query_lower):
                found_skills.append(skill)

        # Determine if skills are required or preferred based on context
        for skill in found_skills:
            # Check context around skill mention
            skill_pos = query_lower.find(skill)
            context_before = query_lower[max(0, skill_pos - 50) : skill_pos]

            is_required = any(
                kw in context_before for kw in self.HARD_REQUIREMENT_KEYWORDS
            )
            is_preferred = any(kw in context_before for kw in self.PREFERENCE_KEYWORDS)

            if is_required and not is_preferred:
                required.append(skill)
            elif is_preferred:
                preferred.append(skill)
            else:
                # Default: treat as required if mentioned prominently
                required.append(skill)

        return required, preferred

    def _extract_experience(
        self,
        query_lower: str,
    ) -> Tuple[Optional[float], Optional[float]]:
        """
        Extract experience requirements from query.
        """
        min_exp = None
        max_exp = None

        for pattern in self.EXPERIENCE_PATTERNS:
            matches = re.findall(pattern, query_lower)
            for match in matches:
                if isinstance(match, tuple):
                    # Range pattern (e.g., "3 to 5 years")
                    try:
                        min_exp = float(match[0])
                        max_exp = float(match[1])
                    except (ValueError, IndexError):
                        pass
                else:
                    # Single value (e.g., "5+ years")
                    try:
                        exp_value = float(match)
                        if (
                            "+" in query_lower
                            or "at least" in query_lower
                            or "minimum" in query_lower
                        ):
                            min_exp = exp_value
                        else:
                            # Could be either min or target
                            min_exp = exp_value
                    except ValueError:
                        pass

        return min_exp, max_exp

    def _extract_role_categories(self, query_lower: str) -> List[RoleCategory]:
        """
        Extract role categories from query.
        """
        categories = []

        for category, keywords in ROLE_KEYWORDS.items():
            for keyword in keywords:
                if keyword in query_lower:
                    categories.append(category)
                    break  # Only add category once

        return list(set(categories))

    def _extract_locations(self, query: str) -> List[str]:
        """
        Extract location preferences from query.
        """
        locations = []

        for pattern in self.LOCATION_PATTERNS:
            matches = re.findall(pattern, query, re.IGNORECASE)
            for match in matches:
                loc = match.strip().lower()
                # Filter out false positives
                if len(loc) > 2 and loc not in ["and", "the", "with", "for"]:
                    locations.append(loc)

        return list(set(locations))[:3]  # Limit to 3 locations

    def _check_remote_preference(self, query_lower: str) -> Optional[bool]:
        """
        Check if query mentions remote work preference.
        """
        remote_positive = ["remote", "work from home", "wfh", "distributed", "anywhere"]
        remote_negative = ["on-site", "onsite", "in-office", "office only", "no remote"]

        for pattern in remote_negative:
            if pattern in query_lower:
                return False

        for pattern in remote_positive:
            if pattern in query_lower:
                return True

        return None

    def _extract_exclusions(self, query_lower: str) -> List[str]:
        """
        Extract explicitly excluded skills.
        """
        exclusions = []

        # Look for patterns like "no Java" or "without PHP"
        for kw in self.EXCLUSION_KEYWORDS:
            if kw in query_lower:
                # Find what follows the exclusion keyword
                pattern = rf"{kw}\s+(\w+)"
                matches = re.findall(pattern, query_lower)
                for match in matches:
                    if match.lower() in SKILL_PATTERNS:
                        exclusions.append(match.lower())

        return exclusions

    def _clean_query_for_embedding(self, query: str) -> str:
        """
        Clean query for embedding by removing explicit filter language.
        Keep the semantic content.
        """
        # Remove explicit filter phrases
        patterns_to_remove = [
            r"\d+\+?\s*years?\s*(?:of\s*)?experience",
            r"at\s*least\s*\d+\s*years?",
            r"must\s*have",
            r"required[\:\s]",
            r"mandatory[\:\s]",
            r"based\s*in\s*[A-Za-z\s,]+",
            r"remote\s*(?:ok|okay|friendly|first)?",
        ]

        clean = query
        for pattern in patterns_to_remove:
            clean = re.sub(pattern, "", clean, flags=re.IGNORECASE)

        # Clean up whitespace
        clean = " ".join(clean.split())

        # If too much was removed, use original
        if len(clean) < len(query) * 0.3:
            return query

        return clean

    def _estimate_confidence(
        self,
        required_skills: List[str],
        preferred_skills: List[str],
        min_exp: Optional[float],
        role_categories: List[RoleCategory],
    ) -> float:
        """
        Estimate confidence in filter extraction.
        """
        score = 0.3  # Base score

        if required_skills or preferred_skills:
            score += 0.3

        if min_exp is not None:
            score += 0.2

        if role_categories:
            score += 0.2

        return min(1.0, score)

    def merge_filters(
        self,
        base_filters: FilterIntent,
        new_filters: FilterIntent,
    ) -> FilterIntent:
        """
        Merge new filters into existing filters (for follow-up queries).
        New filters extend or override base filters.
        """
        # Merge skills (union)
        required_skills = list(
            set(base_filters.required_skills + new_filters.required_skills)
        )
        preferred_skills = list(
            set(base_filters.preferred_skills + new_filters.preferred_skills)
        )

        # Experience: use new if provided, else keep base
        min_exp = new_filters.min_experience_years or base_filters.min_experience_years
        max_exp = new_filters.max_experience_years or base_filters.max_experience_years

        # Role categories: union
        role_categories = list(
            set(base_filters.role_categories + new_filters.role_categories)
        )

        # Locations: union
        locations = list(set(base_filters.locations + new_filters.locations))

        # Remote: new overrides
        remote_ok = (
            new_filters.remote_ok
            if new_filters.remote_ok is not None
            else base_filters.remote_ok
        )

        # Exclusions: union
        exclusions = list(
            set(base_filters.hard_exclude_skills + new_filters.hard_exclude_skills)
        )

        return FilterIntent(
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            min_experience_years=min_exp,
            max_experience_years=max_exp,
            role_categories=role_categories,
            locations=locations,
            remote_ok=remote_ok,
            hard_exclude_skills=exclusions,
            raw_query=new_filters.raw_query,
            extraction_confidence=(
                base_filters.extraction_confidence + new_filters.extraction_confidence
            )
            / 2,
        )


# Global instance
_query_processor = None


def get_query_processor() -> QueryProcessor:
    """Get or create the global query processor instance."""
    global _query_processor
    if _query_processor is None:
        _query_processor = QueryProcessor()
    return _query_processor
