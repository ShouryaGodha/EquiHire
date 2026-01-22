"""
Pydantic models for the recruitment assistant.
Defines data structures for candidates, searches, and API responses.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
import uuid


# ============================================================================
# ENUMS
# ============================================================================


class RoleCategory(str, Enum):
    """Categories for job roles - used for soft filtering."""

    ENGINEERING = "engineering"
    DATA_SCIENCE = "data_science"
    PRODUCT = "product"
    DESIGN = "design"
    MARKETING = "marketing"
    SALES = "sales"
    OPERATIONS = "operations"
    FINANCE = "finance"
    HR = "hr"
    OTHER = "other"


class ChunkType(str, Enum):
    """Types of resume sections."""

    SUMMARY = "summary"
    EXPERIENCE = "experience"
    EDUCATION = "education"
    SKILLS = "skills"
    PROJECTS = "projects"
    CERTIFICATIONS = "certifications"
    OTHER = "other"


# ============================================================================
# CANDIDATE MODELS
# ============================================================================


class ExtractedMetadata(BaseModel):
    """
    Metadata extracted from unstructured resume text.
    All fields are APPROXIMATE and may be incomplete.
    This is by design - we work with imperfect data.
    """

    skills: List[str] = Field(
        default_factory=list, description="Extracted skills (lowercase, normalized)"
    )
    experience_years: Optional[float] = Field(
        None, description="Approximate years of experience"
    )
    role_category: Optional[RoleCategory] = Field(
        None, description="Inferred role category"
    )
    location: Optional[str] = Field(None, description="Extracted location if mentioned")
    is_remote: Optional[bool] = Field(
        None, description="Whether remote work is mentioned"
    )
    education_level: Optional[str] = Field(
        None, description="Highest education level mentioned"
    )
    companies: List[str] = Field(
        default_factory=list, description="Companies mentioned"
    )

    # Confidence scores for extracted fields
    extraction_confidence: float = Field(
        0.5, description="Overall confidence in extraction (0-1)"
    )


class CandidateChunk(BaseModel):
    """
    A single semantic chunk from a candidate's resume.
    This is what gets stored in Qdrant's candidate_chunks collection.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str = Field(..., description="Parent candidate identifier")
    candidate_name: Optional[str] = Field(
        None, description="Candidate name for display"
    )
    chunk_index: int = Field(..., description="Order of this chunk in the resume")
    chunk_type: ChunkType = Field(ChunkType.OTHER, description="Section type")
    text: str = Field(..., description="Raw text content of the chunk")

    # Extracted metadata (approximate)
    metadata: ExtractedMetadata = Field(default_factory=ExtractedMetadata)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Candidate(BaseModel):
    """
    Represents a candidate profile (aggregated from chunks).
    Used for display purposes, not stored directly in Qdrant.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: Optional[str] = Field(None, description="Candidate name if extractable")
    email: Optional[str] = Field(None, description="Contact email if extractable")
    full_text: str = Field(..., description="Complete resume text")
    chunks: List[CandidateChunk] = Field(default_factory=list)

    # Aggregated metadata
    aggregated_metadata: ExtractedMetadata = Field(default_factory=ExtractedMetadata)

    # Source information
    source_file: Optional[str] = Field(None, description="Original file path")
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# SEARCH MODELS
# ============================================================================


class FilterIntent(BaseModel):
    """
    Filters extracted from recruiter's natural language query.
    These are SOFT constraints - they influence ranking but don't hard-exclude.
    """

    required_skills: List[str] = Field(
        default_factory=list, description="Skills that should be present"
    )
    preferred_skills: List[str] = Field(
        default_factory=list, description="Nice-to-have skills"
    )
    min_experience_years: Optional[float] = Field(
        None, description="Minimum years of experience"
    )
    max_experience_years: Optional[float] = Field(
        None, description="Maximum years of experience"
    )
    role_categories: List[RoleCategory] = Field(
        default_factory=list, description="Relevant role categories"
    )
    locations: List[str] = Field(
        default_factory=list, description="Preferred locations"
    )
    remote_ok: Optional[bool] = Field(None, description="Whether remote is acceptable")

    # Hard exclusions (only when explicitly stated)
    hard_exclude_skills: List[str] = Field(
        default_factory=list, description="Skills to exclude"
    )

    # Extraction metadata
    raw_query: str = Field("", description="Original query text")
    extraction_confidence: float = Field(0.5)


class SearchRequest(BaseModel):
    """Request to search for candidates."""

    query: str = Field(
        ..., description="Natural language job description or search query"
    )
    session_id: Optional[str] = Field(
        None, description="Session ID for memory continuity"
    )
    top_k: int = Field(20, ge=1, le=100, description="Number of results to return")

    # Optional explicit filters (override extracted ones)
    explicit_filters: Optional[FilterIntent] = Field(None)

    # Search options
    use_memory: bool = Field(True, description="Whether to use recruiter memory")
    apply_reranking: bool = Field(
        True, description="Whether to apply cross-encoder reranking"
    )


class FollowUpRequest(BaseModel):
    """Follow-up question that refines the search."""

    session_id: str = Field(..., description="Session ID to maintain context")
    question: str = Field(..., description="Natural language follow-up question")

    # Optional: explicit refinements
    add_skills: List[str] = Field(default_factory=list)
    remove_skills: List[str] = Field(default_factory=list)
    adjust_experience: Optional[float] = Field(None)


# ============================================================================
# SCORING MODELS
# ============================================================================


class ScoreBreakdown(BaseModel):
    """
    Transparent breakdown of how a candidate was scored.
    This is critical for explainability and bias detection.
    """

    semantic_similarity: float = Field(
        ..., ge=0, le=1, description="Vector similarity score"
    )
    skills_match: float = Field(..., ge=0, le=1, description="Skill overlap score")
    experience_fit: float = Field(
        ..., ge=0, le=1, description="Experience alignment score"
    )
    role_match: float = Field(..., ge=0, le=1, description="Role category match score")
    availability_score: float = Field(
        0.5, ge=0, le=1, description="Availability/location fit"
    )
    feedback_score: float = Field(
        0.5, ge=0, le=1, description="Historical feedback score"
    )

    # Composite
    total_score: float = Field(..., ge=0, le=1, description="Weighted composite score")

    # Explanations
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    score_explanation: str = Field("", description="Human-readable explanation")


class MatchEvidence(BaseModel):
    """Evidence supporting why a candidate matched."""

    chunk_text: str = Field(..., description="Relevant resume excerpt")
    chunk_type: ChunkType = Field(...)
    relevance_score: float = Field(..., ge=0, le=1)
    matched_terms: List[str] = Field(default_factory=list)


class CandidateMatch(BaseModel):
    """A candidate match result with full explainability."""

    candidate_id: str
    candidate_name: Optional[str] = None

    # Scoring
    score: ScoreBreakdown
    rank: int

    # Evidence
    evidence: List[MatchEvidence] = Field(default_factory=list)

    # Metadata
    extracted_metadata: ExtractedMetadata

    # Filters applied
    filters_matched: List[str] = Field(default_factory=list)
    filters_missed: List[str] = Field(default_factory=list)


# ============================================================================
# RESPONSE MODELS
# ============================================================================


class SearchResponse(BaseModel):
    """Response from a search query."""

    session_id: str
    query: str
    extracted_filters: FilterIntent

    # Results
    matches: List[CandidateMatch]
    total_candidates_scanned: int

    # Metadata
    search_time_ms: float
    filters_applied: List[str]

    # Transparency
    explanation: str = Field(..., description="How results were generated")


class RecruiterMemoryEntry(BaseModel):
    """An entry in the recruiter's search memory."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    query_text: str
    query_type: str = Field("search", description="'search' or 'followup'")
    extracted_filters: FilterIntent
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # For follow-ups, track what changed
    refinements: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# INGESTION MODELS
# ============================================================================


class IngestionResult(BaseModel):
    """Result of ingesting a single resume."""

    candidate_id: str
    source_file: str
    chunks_created: int
    metadata_extracted: ExtractedMetadata
    success: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class BatchIngestionResult(BaseModel):
    """Result of batch ingestion."""

    total_files: int
    successful: int
    failed: int
    results: List[IngestionResult]
    total_chunks_created: int
