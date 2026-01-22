"""
Ingestion pipeline for processing resumes and storing in Qdrant.

This pipeline:
1. Reads raw text files (resumes/profiles)
2. Processes them into semantic chunks
3. Extracts approximate metadata
4. Generates embeddings
5. Stores everything in Qdrant

DESIGN DECISIONS:
1. Support for batch processing for efficiency
2. Idempotent operations - safe to re-run
3. Error handling per-file (one failure doesn't stop batch)
4. Progress reporting for large batches
"""

import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional, Generator
from datetime import datetime

from app.config import get_settings
from app.models import (
    Candidate,
    CandidateChunk,
    IngestionResult,
    BatchIngestionResult,
)
from app.services.qdrant_service import get_qdrant_service
from app.services.embedding_service import get_embedding_service
from app.services.text_processor import get_text_processor

logger = logging.getLogger(__name__)


class IngestionPipeline:
    """
    Pipeline for ingesting resumes into the system.

    Workflow:
    1. Read text file
    2. Process into Candidate with chunks
    3. Generate embeddings for each chunk
    4. Store in Qdrant
    """

    def __init__(self):
        self.settings = get_settings()
        self.qdrant = get_qdrant_service()
        self.embedder = get_embedding_service()
        self.processor = get_text_processor()

    def ingest_file(
        self,
        file_path: str,
        candidate_id: Optional[str] = None,
    ) -> IngestionResult:
        """
        Ingest a single resume file.

        Args:
            file_path: Path to the text file
            candidate_id: Optional ID (generated if not provided)

        Returns:
            IngestionResult with status and details
        """
        errors = []
        warnings = []

        # Generate candidate ID if not provided
        if candidate_id is None:
            candidate_id = str(uuid.uuid4())

        try:
            # Read file
            path = Path(file_path)
            if not path.exists():
                return IngestionResult(
                    candidate_id=candidate_id,
                    source_file=file_path,
                    chunks_created=0,
                    metadata_extracted=None,
                    success=False,
                    errors=[f"File not found: {file_path}"],
                )

            # Read text content
            text = self._read_file(path)
            if not text or len(text.strip()) < 50:
                return IngestionResult(
                    candidate_id=candidate_id,
                    source_file=file_path,
                    chunks_created=0,
                    metadata_extracted=None,
                    success=False,
                    errors=["File is empty or too short"],
                )

            # Process resume
            candidate = self.processor.process_resume(
                text=text,
                candidate_id=candidate_id,
                source_file=str(path),
            )

            if not candidate.chunks:
                warnings.append("No chunks were created from resume")

            # Generate embeddings for all chunks
            chunk_texts = [chunk.text for chunk in candidate.chunks]
            embeddings = self.embedder.embed_texts(chunk_texts)

            # Propagate aggregated metadata and candidate name to all chunks
            # This ensures each chunk has the full candidate context
            for chunk in candidate.chunks:
                # Propagate candidate name to all chunks for easier retrieval
                if candidate.name:
                    chunk.candidate_name = candidate.name

                # Merge chunk-specific skills with aggregated skills
                all_skills = list(
                    set(chunk.metadata.skills + candidate.aggregated_metadata.skills)
                )
                chunk.metadata.skills = all_skills

                # Use aggregated values for fields that weren't found in chunk
                if chunk.metadata.experience_years is None:
                    chunk.metadata.experience_years = (
                        candidate.aggregated_metadata.experience_years
                    )
                if chunk.metadata.role_category is None:
                    chunk.metadata.role_category = (
                        candidate.aggregated_metadata.role_category
                    )
                if chunk.metadata.location is None:
                    chunk.metadata.location = candidate.aggregated_metadata.location
                if chunk.metadata.is_remote is None:
                    chunk.metadata.is_remote = candidate.aggregated_metadata.is_remote

            # Store in Qdrant
            self.qdrant.upsert_candidate_chunks_batch(candidate.chunks, embeddings)

            logger.info(
                f"Ingested {len(candidate.chunks)} chunks for candidate {candidate_id}"
            )

            return IngestionResult(
                candidate_id=candidate_id,
                source_file=file_path,
                chunks_created=len(candidate.chunks),
                metadata_extracted=candidate.aggregated_metadata,
                success=True,
                errors=errors,
                warnings=warnings,
            )

        except Exception as e:
            logger.error(f"Failed to ingest {file_path}: {e}")
            return IngestionResult(
                candidate_id=candidate_id,
                source_file=file_path,
                chunks_created=0,
                metadata_extracted=None,
                success=False,
                errors=[str(e)],
            )

    def ingest_text(
        self,
        text: str,
        candidate_id: Optional[str] = None,
        source_name: str = "direct_input",
    ) -> IngestionResult:
        """
        Ingest resume from raw text (not file).
        Useful for API uploads.
        """
        if candidate_id is None:
            candidate_id = str(uuid.uuid4())

        try:
            # Process resume
            candidate = self.processor.process_resume(
                text=text,
                candidate_id=candidate_id,
                source_file=source_name,
            )

            # Generate embeddings
            chunk_texts = [chunk.text for chunk in candidate.chunks]
            embeddings = self.embedder.embed_texts(chunk_texts)

            # Propagate candidate name and metadata to all chunks
            for chunk in candidate.chunks:
                # Propagate candidate name to all chunks for easier retrieval
                if candidate.name:
                    chunk.candidate_name = candidate.name

                all_skills = list(
                    set(chunk.metadata.skills + candidate.aggregated_metadata.skills)
                )
                chunk.metadata.skills = all_skills
                if chunk.metadata.experience_years is None:
                    chunk.metadata.experience_years = (
                        candidate.aggregated_metadata.experience_years
                    )
                if chunk.metadata.role_category is None:
                    chunk.metadata.role_category = (
                        candidate.aggregated_metadata.role_category
                    )
                if chunk.metadata.location is None:
                    chunk.metadata.location = candidate.aggregated_metadata.location
                if chunk.metadata.is_remote is None:
                    chunk.metadata.is_remote = candidate.aggregated_metadata.is_remote

            # Store in Qdrant
            self.qdrant.upsert_candidate_chunks_batch(candidate.chunks, embeddings)

            return IngestionResult(
                candidate_id=candidate_id,
                source_file=source_name,
                chunks_created=len(candidate.chunks),
                metadata_extracted=candidate.aggregated_metadata,
                success=True,
            )

        except Exception as e:
            logger.error(f"Failed to ingest text: {e}")
            return IngestionResult(
                candidate_id=candidate_id,
                source_file=source_name,
                chunks_created=0,
                metadata_extracted=None,
                success=False,
                errors=[str(e)],
            )

    def ingest_directory(
        self,
        directory: str,
        file_extensions: List[str] = [".txt", ".md"],
        recursive: bool = True,
    ) -> BatchIngestionResult:
        """
        Ingest all resume files from a directory.

        Args:
            directory: Path to directory containing resumes
            file_extensions: List of file extensions to process
            recursive: Whether to search subdirectories

        Returns:
            BatchIngestionResult with summary and per-file results
        """
        dir_path = Path(directory)

        if not dir_path.exists():
            return BatchIngestionResult(
                total_files=0,
                successful=0,
                failed=0,
                results=[],
                total_chunks_created=0,
            )

        # Find all matching files
        files = []
        for ext in file_extensions:
            if recursive:
                files.extend(dir_path.rglob(f"*{ext}"))
            else:
                files.extend(dir_path.glob(f"*{ext}"))

        logger.info(f"Found {len(files)} files to process in {directory}")

        # Process each file
        results = []
        successful = 0
        failed = 0
        total_chunks = 0

        for i, file_path in enumerate(files):
            logger.info(f"Processing file {i + 1}/{len(files)}: {file_path.name}")

            result = self.ingest_file(str(file_path))
            results.append(result)

            if result.success:
                successful += 1
                total_chunks += result.chunks_created
            else:
                failed += 1

        return BatchIngestionResult(
            total_files=len(files),
            successful=successful,
            failed=failed,
            results=results,
            total_chunks_created=total_chunks,
        )

    def _read_file(self, path: Path) -> str:
        """Read file content with encoding detection."""
        encodings = ["utf-8", "latin-1", "cp1252"]

        for encoding in encodings:
            try:
                with open(path, "r", encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue

        # Last resort: read as binary and decode with errors ignored
        with open(path, "rb") as f:
            return f.read().decode("utf-8", errors="ignore")


def create_sample_resumes(output_dir: str) -> List[str]:
    """
    Create sample resume files for testing.
    Returns list of created file paths.
    """
    dir_path = Path(output_dir)
    dir_path.mkdir(parents=True, exist_ok=True)

    sample_resumes = [
        {
            "filename": "john_doe_backend.txt",
            "content": """John Doe
john.doe@email.com
San Francisco, CA

SUMMARY
Senior Backend Engineer with 7 years of experience building scalable distributed systems.
Passionate about clean code, performance optimization, and mentoring junior developers.

EXPERIENCE

Senior Software Engineer | TechCorp Inc. | 2020 - Present
- Designed and implemented microservices architecture handling 10M+ requests/day
- Led migration from monolith to Kubernetes-based infrastructure
- Technologies: Python, Go, PostgreSQL, Redis, AWS, Docker, Kubernetes

Software Engineer | StartupXYZ | 2017 - 2020
- Built real-time data pipeline processing 100GB+ daily
- Implemented REST APIs and GraphQL endpoints
- Technologies: Python, Django, Celery, RabbitMQ, MongoDB

EDUCATION
B.S. Computer Science | Stanford University | 2017

SKILLS
Python, Go, Java, PostgreSQL, MongoDB, Redis, AWS, GCP, Docker, Kubernetes,
Terraform, CI/CD, Microservices, REST APIs, GraphQL, Agile, TDD
""",
        },
        {
            "filename": "jane_smith_fullstack.txt",
            "content": """Jane Smith
jane.smith@email.com
New York, NY | Open to Remote

PROFESSIONAL SUMMARY
Full Stack Developer with 5 years of experience in web application development.
Expert in React ecosystem and Node.js backend development.

WORK EXPERIENCE

Full Stack Developer | WebAgency Pro | 2021 - Present
- Developed customer-facing React applications with TypeScript
- Built Node.js microservices with Express and NestJS
- Implemented real-time features using WebSocket and Socket.io
- Tech stack: React, TypeScript, Node.js, PostgreSQL, Redis, Docker

Frontend Developer | DigitalCo | 2019 - 2021
- Created responsive web applications using React and Redux
- Collaborated with UX team to implement pixel-perfect designs
- Improved page load times by 40% through optimization

EDUCATION
M.S. Computer Science | NYU | 2019
B.S. Information Technology | Penn State | 2017

SKILLS
JavaScript, TypeScript, React, Redux, Node.js, Express, NestJS, PostgreSQL,
MongoDB, Redis, Docker, AWS, Git, Agile, REST APIs, GraphQL
""",
        },
        {
            "filename": "alex_chen_ml.txt",
            "content": """Alex Chen
alex.chen@email.com
Seattle, WA

ABOUT
Machine Learning Engineer with 4 years of experience in NLP and computer vision.
Published researcher with focus on transformer architectures and efficient inference.

EXPERIENCE

ML Engineer | AI Startup | 2022 - Present
- Developed production NLP models for sentiment analysis and named entity recognition
- Implemented RAG systems using LangChain and vector databases
- Reduced model inference latency by 60% through optimization and quantization
- Technologies: Python, PyTorch, Transformers, Qdrant, FastAPI, AWS SageMaker

Data Scientist | BigData Corp | 2020 - 2022
- Built recommendation systems serving 5M+ users
- Developed computer vision models for image classification
- Created data pipelines using Spark and Airflow

EDUCATION
Ph.D. Computer Science (ML focus) | University of Washington | 2020
B.S. Mathematics | UC Berkeley | 2016

SKILLS
Python, PyTorch, TensorFlow, Scikit-learn, NLP, Computer Vision, LLMs,
Transformers, BERT, GPT, RAG, Vector Databases, AWS, Docker, MLOps
""",
        },
        {
            "filename": "sarah_johnson_devops.txt",
            "content": """Sarah Johnson
sarah.j@email.com
Austin, TX | Remote

PROFILE
DevOps Engineer with 6 years of experience in cloud infrastructure and automation.
Certified AWS Solutions Architect and Kubernetes Administrator.

PROFESSIONAL EXPERIENCE

Senior DevOps Engineer | CloudScale Inc. | 2021 - Present
- Architected multi-region AWS infrastructure for high availability
- Implemented GitOps workflows using ArgoCD and Flux
- Reduced deployment time from hours to minutes with CI/CD automation
- Managed Kubernetes clusters with 500+ pods across environments

DevOps Engineer | TechServices | 2018 - 2021
- Built infrastructure as code using Terraform and CloudFormation
- Implemented monitoring and alerting with Prometheus and Grafana
- Automated security compliance checks and vulnerability scanning

EDUCATION
B.S. Computer Engineering | UT Austin | 2018

CERTIFICATIONS
- AWS Solutions Architect Professional
- Certified Kubernetes Administrator (CKA)
- HashiCorp Terraform Associate

SKILLS
AWS, GCP, Azure, Kubernetes, Docker, Terraform, Ansible, Jenkins, GitLab CI,
GitHub Actions, ArgoCD, Prometheus, Grafana, Linux, Python, Bash, Go
""",
        },
        {
            "filename": "mike_wilson_frontend.txt",
            "content": """Mike Wilson
mikew@email.com
Chicago, IL

SUMMARY
Creative Frontend Developer with 3 years of experience building beautiful,
accessible web applications. Passionate about user experience and modern CSS.

EXPERIENCE

Frontend Developer | DesignTech | 2022 - Present
- Built component libraries using React and Storybook
- Implemented responsive designs with Tailwind CSS
- Improved Core Web Vitals scores by 35%
- Technologies: React, TypeScript, Next.js, Tailwind CSS, Framer Motion

Junior Frontend Developer | WebWorks | 2021 - 2022
- Developed landing pages and marketing websites
- Created animations and interactive elements
- Learned and applied accessibility best practices

EDUCATION
B.A. Digital Design | Columbia College Chicago | 2021
Bootcamp: Full Stack Web Development | 2020

SKILLS
JavaScript, TypeScript, React, Next.js, Vue.js, HTML, CSS, Sass, Tailwind CSS,
Figma, Responsive Design, Accessibility, Git, Agile
""",
        },
    ]

    created_files = []
    for resume in sample_resumes:
        file_path = dir_path / resume["filename"]
        with open(file_path, "w") as f:
            f.write(resume["content"])
        created_files.append(str(file_path))
        logger.info(f"Created sample resume: {file_path}")

    return created_files


# Global instance
_ingestion_pipeline: Optional[IngestionPipeline] = None


def get_ingestion_pipeline() -> IngestionPipeline:
    """Get or create the global ingestion pipeline instance."""
    global _ingestion_pipeline
    if _ingestion_pipeline is None:
        _ingestion_pipeline = IngestionPipeline()
    return _ingestion_pipeline
