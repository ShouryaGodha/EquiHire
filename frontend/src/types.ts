/**
 * TypeScript types matching the backend models.
 */

export interface ExtractedMetadata {
    skills: string[];
    experience_years: number | null;
    role_category: string | null;
    location: string | null;
    is_remote: boolean | null;
    education_level: string | null;
    companies: string[];
    extraction_confidence: number;
}

export interface FilterIntent {
    required_skills: string[];
    preferred_skills: string[];
    min_experience_years: number | null;
    max_experience_years: number | null;
    role_categories: string[];
    locations: string[];
    remote_ok: boolean | null;
    hard_exclude_skills: string[];
    raw_query: string;
    extraction_confidence: number;
}

export interface ScoreBreakdown {
    semantic_similarity: number;
    skills_match: number;
    experience_fit: number;
    role_match: number;
    availability_score: number;
    feedback_score: number;
    total_score: number;
    matched_skills: string[];
    missing_skills: string[];
    score_explanation: string;
}

export interface MatchEvidence {
    chunk_text: string;
    chunk_type: string;
    relevance_score: number;
    matched_terms: string[];
}

export interface CandidateMatch {
    candidate_id: string;
    candidate_name: string | null;
    score: ScoreBreakdown;
    rank: number;
    evidence: MatchEvidence[];
    extracted_metadata: ExtractedMetadata;
    filters_matched: string[];
    filters_missed: string[];
}

export interface SearchRequest {
    query: string;
    session_id?: string;
    top_k?: number;
    use_memory?: boolean;
    apply_reranking?: boolean;
}

export interface SearchResponse {
    session_id: string;
    query: string;
    extracted_filters: FilterIntent;
    matches: CandidateMatch[];
    total_candidates_scanned: number;
    search_time_ms: number;
    filters_applied: string[];
    explanation: string;
}

export interface FollowUpRequest {
    session_id: string;
    question: string;
    add_skills?: string[];
    remove_skills?: string[];
    adjust_experience?: number;
}

export interface IngestionResult {
    candidate_id: string;
    source_file: string;
    chunks_created: number;
    metadata_extracted: ExtractedMetadata | null;
    success: boolean;
    errors: string[];
    warnings: string[];
}

export interface BatchIngestionResult {
    total_files: number;
    successful: number;
    failed: number;
    results: IngestionResult[];
    total_chunks_created: number;
}

export interface BulkUploadStatus {
    total_files: number;
    processed: number;
    successful: number;
    failed: number;
    is_complete: boolean;
    results: IngestionResult[];
    errors: string[];
}

export interface IngestionStatusResponse {
    status: string;
    total_chunks: number;
    is_ready_for_search: boolean;
    message: string;
}
