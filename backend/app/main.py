"""
FastAPI application for the ethical AI recruitment assistant.

API Routes:
- POST /api/search - Search for candidates
- POST /api/followup - Refine search with follow-up question
- POST /api/ingest/file - Ingest a single resume
- POST /api/ingest/text - Ingest resume from text
- POST /api/ingest/directory - Batch ingest from directory
- GET /api/candidates/{id} - Get candidate details
- GET /api/health - Health check
- GET /api/stats - System statistics
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.models import (
    SearchRequest,
    SearchResponse,
    FollowUpRequest,
    IngestionResult,
    BatchIngestionResult,
    ExtractedMetadata,
    CandidateMatch,
)
from app.services import (
    get_qdrant_service,
    get_search_service,
    get_ingestion_pipeline,
)
from app.services.ingestion import create_sample_resumes

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, cleanup on shutdown."""
    logger.info("Starting up recruitment assistant...")

    # Initialize Qdrant collections
    qdrant = get_qdrant_service()
    qdrant.init_collections()

    logger.info("Startup complete!")

    yield

    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Ethical AI Recruitment Assistant",
    description="""
    An AI-powered recruitment assistant that addresses bias and exclusion in hiring.
    
    ## Features
    - Semantic search over unstructured resumes
    - Hybrid filtering with soft constraints
    - Transparent, explainable scoring
    - Follow-up refinement with memory
    
    ## Design Principles
    - No hard exclusion based on imperfect metadata
    - All scores are explainable
    - Humans remain in the decision loop
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# HEALTH & STATUS ENDPOINTS
# ============================================================================


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "recruitment-assistant"}


@app.get("/api/stats")
async def get_stats():
    """Get system statistics."""
    qdrant = get_qdrant_service()
    stats = qdrant.get_collection_stats()
    return {
        "status": "ok",
        "collections": stats,
    }


# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================


@app.post("/api/search", response_model=SearchResponse)
async def search_candidates(request: SearchRequest):
    """
    Search for candidates matching a job description.

    The query is processed to extract:
    - Semantic intent (embedded for vector search)
    - Soft filter constraints (skills, experience, role)

    Candidates are ranked by a transparent composite score.
    All filters are SOFT by default - they influence ranking
    but do not hard-exclude candidates.
    """
    try:
        search_service = get_search_service()
        result = search_service.search(request)
        return result
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/followup", response_model=SearchResponse)
async def follow_up_search(request: FollowUpRequest):
    """
    Refine search with a follow-up question.

    Follow-ups:
    - Add or modify filter criteria
    - Adjust semantic search direction
    - Are stored in memory for session continuity

    Requires a session_id from a previous search.
    """
    try:
        search_service = get_search_service()
        result = search_service.follow_up(request)
        return result
    except Exception as e:
        logger.error(f"Follow-up error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# INGESTION ENDPOINTS
# ============================================================================


class TextIngestionRequest(BaseModel):
    """Request to ingest resume from raw text."""

    text: str
    candidate_id: Optional[str] = None


@app.post("/api/ingest/text", response_model=IngestionResult)
async def ingest_text(request: TextIngestionRequest):
    """
    Ingest a resume from raw text.

    The resume will be:
    - Chunked into semantic sections
    - Metadata extracted (skills, experience, etc.)
    - Embedded and stored in Qdrant
    """
    try:
        pipeline = get_ingestion_pipeline()
        result = pipeline.ingest_text(
            text=request.text,
            candidate_id=request.candidate_id,
        )
        return result
    except Exception as e:
        logger.error(f"Ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest/file", response_model=IngestionResult)
async def ingest_file(file: UploadFile = File(...)):
    """
    Ingest a resume from an uploaded file.
    """
    try:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")

        pipeline = get_ingestion_pipeline()
        result = pipeline.ingest_text(
            text=text,
            source_name=file.filename or "upload",
        )
        return result
    except Exception as e:
        logger.error(f"File ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DirectoryIngestionRequest(BaseModel):
    """Request to ingest resumes from a directory."""

    directory: str
    extensions: List[str] = [".txt", ".md"]
    recursive: bool = True


@app.post("/api/ingest/directory", response_model=BatchIngestionResult)
async def ingest_directory(request: DirectoryIngestionRequest):
    """
    Batch ingest resumes from a directory.
    """
    try:
        pipeline = get_ingestion_pipeline()
        result = pipeline.ingest_directory(
            directory=request.directory,
            file_extensions=request.extensions,
            recursive=request.recursive,
        )
        return result
    except Exception as e:
        logger.error(f"Directory ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest/samples", response_model=BatchIngestionResult)
async def create_and_ingest_samples():
    """
    Create sample resume files and ingest them.
    Useful for testing and demonstration.
    """
    try:
        settings = get_settings()
        sample_dir = str(settings.data_dir / "samples")

        # Create sample files
        create_sample_resumes(sample_dir)

        # Ingest them
        pipeline = get_ingestion_pipeline()
        result = pipeline.ingest_directory(sample_dir)

        return result
    except Exception as e:
        logger.error(f"Sample creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PDF TEXT EXTRACTION ENDPOINT
# ============================================================================


class PDFTextResponse(BaseModel):
    """Response from PDF text extraction."""

    text: str
    pages: int
    success: bool


@app.post("/api/parse-pdf", response_model=PDFTextResponse)
async def parse_pdf(file: UploadFile = File(...)):
    """
    Parse a PDF file and extract its text content.

    This endpoint is useful for converting PDF job descriptions to text.
    Returns the extracted text content.
    """
    # Validate file is a PDF
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="File must be a PDF. Only PDF files are accepted.",
        )

    try:
        content = await file.read()

        from pypdf import PdfReader
        import io

        reader = PdfReader(io.BytesIO(content))
        text_parts = []

        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)

        extracted_text = "\n\n".join(text_parts)

        if not extracted_text or len(extracted_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract sufficient text from the PDF. The file may be image-based or empty.",
            )

        return PDFTextResponse(
            text=extracted_text, pages=len(reader.pages), success=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")


# ============================================================================
# BULK PDF UPLOAD ENDPOINT
# ============================================================================


class BulkUploadStatus(BaseModel):
    """Status of bulk upload operation."""

    total_files: int
    processed: int
    successful: int
    failed: int
    is_complete: bool
    results: List[IngestionResult]
    errors: List[str]


def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text content from a PDF file."""
    try:
        from pypdf import PdfReader
        import io

        reader = PdfReader(io.BytesIO(file_content))
        text_parts = []

        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)

        return "\n\n".join(text_parts)
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")


@app.post("/api/ingest/bulk-pdf", response_model=BulkUploadStatus)
async def bulk_upload_pdfs(files: List[UploadFile] = File(...)):
    """
    Bulk upload up to 10 PDF resumes.

    Each PDF will be:
    - Parsed to extract text
    - Chunked into semantic sections
    - Metadata extracted
    - Embedded and stored in Qdrant

    Returns status with success/failure for each file.
    """
    MAX_FILES = 10

    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_FILES} files allowed per upload"
        )

    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No files provided")

    # Validate all files are PDFs
    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="File must have a filename")
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"File '{file.filename}' is not a PDF. Only PDF files are accepted.",
            )

    results: List[IngestionResult] = []
    errors: List[str] = []
    successful = 0
    failed = 0

    pipeline = get_ingestion_pipeline()

    for file in files:
        try:
            # Read file content
            content = await file.read()

            # Extract text from PDF
            try:
                text = extract_text_from_pdf(content)
            except ValueError as e:
                errors.append(f"{file.filename}: {str(e)}")
                failed += 1
                results.append(
                    IngestionResult(
                        candidate_id="",
                        source_file=file.filename or "unknown",
                        chunks_created=0,
                        metadata_extracted=None,
                        success=False,
                        errors=[str(e)],
                    )
                )
                continue

            if not text or len(text.strip()) < 50:
                errors.append(
                    f"{file.filename}: Could not extract sufficient text from PDF"
                )
                failed += 1
                results.append(
                    IngestionResult(
                        candidate_id="",
                        source_file=file.filename or "unknown",
                        chunks_created=0,
                        metadata_extracted=None,
                        success=False,
                        errors=["Could not extract sufficient text from PDF"],
                    )
                )
                continue

            # Ingest the extracted text
            result = pipeline.ingest_text(
                text=text,
                source_name=file.filename or "pdf_upload",
            )

            results.append(result)

            if result.success:
                successful += 1
                logger.info(
                    f"Successfully ingested {file.filename}: {result.chunks_created} chunks"
                )
            else:
                failed += 1
                errors.extend([f"{file.filename}: {e}" for e in result.errors])

        except Exception as e:
            logger.error(f"Error processing {file.filename}: {e}")
            errors.append(f"{file.filename}: {str(e)}")
            failed += 1
            results.append(
                IngestionResult(
                    candidate_id="",
                    source_file=file.filename or "unknown",
                    chunks_created=0,
                    metadata_extracted=None,
                    success=False,
                    errors=[str(e)],
                )
            )

    return BulkUploadStatus(
        total_files=len(files),
        processed=len(files),
        successful=successful,
        failed=failed,
        is_complete=True,
        results=results,
        errors=errors,
    )


@app.get("/api/ingest/status")
async def get_ingestion_status():
    """
    Get current ingestion status and system readiness.
    Returns the number of candidates and chunks in the system.
    """
    try:
        qdrant = get_qdrant_service()
        stats = qdrant.get_collection_stats()

        chunks_collection = stats.get("candidate_chunks", {})
        points_count = (
            chunks_collection.get("points_count", 0)
            if isinstance(chunks_collection, dict)
            else 0
        )

        return {
            "status": "ready",
            "total_chunks": points_count,
            "is_ready_for_search": points_count > 0,
            "message": f"System has {points_count} resume chunks indexed and ready for search"
            if points_count > 0
            else "No resumes indexed yet. Upload some resumes to get started.",
        }
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return {
            "status": "error",
            "total_chunks": 0,
            "is_ready_for_search": False,
            "message": str(e),
        }


# ============================================================================
# CANDIDATE ENDPOINTS
# ============================================================================


class CandidateDetails(BaseModel):
    """Detailed candidate information."""

    candidate_id: str
    chunks: List[dict]
    metadata: ExtractedMetadata


@app.get("/api/candidates/{candidate_id}")
async def get_candidate(candidate_id: str):
    """
    Get detailed information about a candidate.
    """
    try:
        qdrant = get_qdrant_service()
        chunks = qdrant.get_candidate_chunks(candidate_id)

        if not chunks:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Aggregate metadata
        from app.services.scoring import get_scoring_service

        scorer = get_scoring_service()

        # Format chunks for response
        formatted_chunks = [
            {
                "id": str(i),
                "payload": chunk,
            }
            for i, chunk in enumerate(chunks)
        ]

        metadata = scorer._aggregate_chunk_metadata(formatted_chunks)

        return {
            "candidate_id": candidate_id,
            "chunks": chunks,
            "metadata": metadata.model_dump(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Candidate fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str):
    """
    Delete a candidate and all their chunks.
    """
    try:
        qdrant = get_qdrant_service()
        qdrant.delete_candidate(candidate_id)
        return {"status": "deleted", "candidate_id": candidate_id}
    except Exception as e:
        logger.error(f"Candidate deletion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================


@app.post("/api/admin/reset")
async def reset_collections(confirm: bool = Query(False)):
    """
    Reset all collections. USE WITH CAUTION.
    Requires confirm=true query parameter.
    """
    if not confirm:
        raise HTTPException(
            status_code=400, detail="Must pass confirm=true to reset collections"
        )

    try:
        qdrant = get_qdrant_service()
        qdrant.reset_collections(confirm=True)
        return {"status": "reset", "message": "All collections have been reset"}
    except Exception as e:
        logger.error(f"Reset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROOT
# ============================================================================


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Ethical AI Recruitment Assistant",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }
