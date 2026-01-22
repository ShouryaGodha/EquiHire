"""
Text processing service for resume parsing and metadata extraction.

DESIGN DECISIONS:
1. Chunk resumes into semantic sections for granular matching
2. Extract approximate metadata using heuristics (no LLM required initially)
3. All extraction is APPROXIMATE - this is by design
4. Missing or incomplete data is acceptable
"""

import re
import logging
from typing import List, Optional, Tuple, Dict, Any
from pathlib import Path

from app.models import (
    CandidateChunk,
    Candidate,
    ExtractedMetadata,
    ChunkType,
    RoleCategory,
)
from app.config import get_settings

logger = logging.getLogger(__name__)


# ============================================================================
# SKILL PATTERNS - Extensible list of known skills
# ============================================================================

SKILL_PATTERNS = {
    # Programming Languages
    "python",
    "java",
    "javascript",
    "typescript",
    "c++",
    "c#",
    "ruby",
    "go",
    "golang",
    "rust",
    "scala",
    "kotlin",
    "swift",
    "php",
    "perl",
    "r",
    "matlab",
    "julia",
    "haskell",
    "erlang",
    "elixir",
    "clojure",
    "lua",
    "shell",
    "bash",
    # Web Technologies
    "html",
    "css",
    "sass",
    "less",
    "react",
    "reactjs",
    "angular",
    "vue",
    "vuejs",
    "svelte",
    "nextjs",
    "next.js",
    "nuxt",
    "gatsby",
    "jquery",
    "bootstrap",
    "tailwind",
    "tailwindcss",
    "webpack",
    "vite",
    "redux",
    # Backend Frameworks
    "django",
    "flask",
    "fastapi",
    "express",
    "expressjs",
    "node",
    "nodejs",
    "spring",
    "springboot",
    "rails",
    "laravel",
    "asp.net",
    ".net",
    "dotnet",
    # Databases
    "sql",
    "mysql",
    "postgresql",
    "postgres",
    "mongodb",
    "redis",
    "cassandra",
    "dynamodb",
    "elasticsearch",
    "neo4j",
    "sqlite",
    "oracle",
    "mssql",
    "mariadb",
    "couchdb",
    "firebase",
    "supabase",
    # Cloud & DevOps
    "aws",
    "azure",
    "gcp",
    "google cloud",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ansible",
    "jenkins",
    "circleci",
    "github actions",
    "gitlab ci",
    "ci/cd",
    "devops",
    "linux",
    "unix",
    "nginx",
    "apache",
    # Data & ML
    "machine learning",
    "ml",
    "deep learning",
    "dl",
    "tensorflow",
    "pytorch",
    "keras",
    "scikit-learn",
    "sklearn",
    "pandas",
    "numpy",
    "scipy",
    "data science",
    "data analysis",
    "data engineering",
    "etl",
    "spark",
    "hadoop",
    "airflow",
    "kafka",
    "nlp",
    "computer vision",
    "cv",
    "transformers",
    "bert",
    "gpt",
    "llm",
    "rag",
    # Tools & Practices
    "git",
    "github",
    "gitlab",
    "bitbucket",
    "jira",
    "confluence",
    "agile",
    "scrum",
    "kanban",
    "tdd",
    "bdd",
    "microservices",
    "rest",
    "restful",
    "graphql",
    "grpc",
    "api",
    "oauth",
    "jwt",
    "websocket",
    # Mobile
    "ios",
    "android",
    "react native",
    "flutter",
    "xamarin",
    "ionic",
    # Other
    "blockchain",
    "solidity",
    "web3",
    "cybersecurity",
    "penetration testing",
    "figma",
    "sketch",
    "adobe xd",
    "ui/ux",
    "product management",
}

# US State abbreviations and full names
US_STATES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "District of Columbia",
}

# Common major cities (for validation)
MAJOR_CITIES = {
    "new york",
    "los angeles",
    "chicago",
    "houston",
    "phoenix",
    "philadelphia",
    "san antonio",
    "san diego",
    "dallas",
    "san jose",
    "austin",
    "jacksonville",
    "fort worth",
    "columbus",
    "charlotte",
    "san francisco",
    "indianapolis",
    "seattle",
    "denver",
    "washington",
    "boston",
    "el paso",
    "detroit",
    "nashville",
    "portland",
    "memphis",
    "oklahoma city",
    "las vegas",
    "louisville",
    "baltimore",
    "milwaukee",
    "albuquerque",
    "tucson",
    "fresno",
    "sacramento",
    "mesa",
    "kansas city",
    "atlanta",
    "miami",
    "raleigh",
    "omaha",
    "colorado springs",
    "virginia beach",
    "long beach",
    "oakland",
    "minneapolis",
    "tulsa",
    "tampa",
    "arlington",
    "new orleans",
    "wichita",
    "cleveland",
    "bakersfield",
    "aurora",
    "anaheim",
    "honolulu",
    "santa ana",
    "riverside",
    "corpus christi",
    "lexington",
    "stockton",
    "henderson",
    "saint paul",
    "st louis",
    "cincinnati",
    "pittsburgh",
    "greensboro",
    "anchorage",
    "plano",
    "lincoln",
    "orlando",
    "irvine",
    "newark",
    "durham",
    "chula vista",
    "toledo",
    "fort wayne",
    "st petersburg",
    "laredo",
    "jersey city",
    "chandler",
    "madison",
    "lubbock",
    "scottsdale",
    "reno",
    "buffalo",
    "gilbert",
    "glendale",
    "north las vegas",
    "winston salem",
    "chesapeake",
    "norfolk",
    "fremont",
    "garland",
    "irving",
    "hialeah",
    "richmond",
    "boise",
    "spokane",
    "baton rouge",
    "palo alto",
    "mountain view",
    "sunnyvale",
    "cupertino",
    "menlo park",
    "redwood city",
    "santa clara",
    "berkeley",
    "cambridge",
    # International cities
    "london",
    "paris",
    "berlin",
    "tokyo",
    "sydney",
    "melbourne",
    "toronto",
    "vancouver",
    "amsterdam",
    "dublin",
    "singapore",
    "hong kong",
    "bangalore",
    "mumbai",
    "delhi",
    "hyderabad",
    "pune",
    "chennai",
    "kolkata",
    "shanghai",
    "beijing",
    "shenzhen",
    "tel aviv",
    "zurich",
    "geneva",
    "stockholm",
    "oslo",
    "copenhagen",
    "helsinki",
    "warsaw",
    "prague",
    "vienna",
    "barcelona",
    "madrid",
    "lisbon",
    "milan",
    "rome",
}

# Countries for validation
COUNTRIES = {
    "usa",
    "united states",
    "us",
    "uk",
    "united kingdom",
    "canada",
    "australia",
    "germany",
    "france",
    "india",
    "japan",
    "china",
    "singapore",
    "ireland",
    "netherlands",
    "sweden",
    "norway",
    "denmark",
    "finland",
    "switzerland",
    "israel",
    "brazil",
    "mexico",
    "spain",
    "italy",
    "poland",
    "czech republic",
    "austria",
    "belgium",
    "portugal",
    "new zealand",
    "south korea",
    "taiwan",
    "hong kong",
    "uae",
    "united arab emirates",
    "dubai",
}

# Role keywords for category inference
ROLE_KEYWORDS = {
    RoleCategory.ENGINEERING: [
        "software engineer",
        "developer",
        "programmer",
        "sde",
        "backend",
        "frontend",
        "full stack",
        "fullstack",
        "devops",
        "sre",
        "architect",
        "engineering",
        "technical lead",
        "tech lead",
        "platform engineer",
    ],
    RoleCategory.DATA_SCIENCE: [
        "data scientist",
        "data analyst",
        "machine learning",
        "ml engineer",
        "ai engineer",
        "research scientist",
        "data engineer",
        "analytics",
        "statistician",
        "quantitative",
        "deep learning",
    ],
    RoleCategory.PRODUCT: [
        "product manager",
        "product owner",
        "pm",
        "product lead",
        "product analyst",
        "growth",
        "strategy",
    ],
    RoleCategory.DESIGN: [
        "designer",
        "ux",
        "ui",
        "user experience",
        "user interface",
        "visual designer",
        "graphic designer",
        "product designer",
    ],
    RoleCategory.MARKETING: [
        "marketing",
        "growth",
        "seo",
        "sem",
        "content",
        "brand",
        "digital marketing",
        "social media",
    ],
    RoleCategory.SALES: [
        "sales",
        "business development",
        "account executive",
        "ae",
        "customer success",
        "account manager",
    ],
    RoleCategory.OPERATIONS: [
        "operations",
        "ops",
        "logistics",
        "supply chain",
        "procurement",
    ],
    RoleCategory.FINANCE: [
        "finance",
        "accounting",
        "financial analyst",
        "controller",
        "treasury",
        "tax",
        "audit",
    ],
    RoleCategory.HR: [
        "human resources",
        "hr",
        "recruiting",
        "recruiter",
        "talent",
        "people operations",
        "compensation",
        "benefits",
    ],
}

# Section headers for chunking
SECTION_PATTERNS = {
    ChunkType.SUMMARY: [
        r"summary",
        r"objective",
        r"profile",
        r"about me",
        r"overview",
        r"professional summary",
        r"career objective",
    ],
    ChunkType.EXPERIENCE: [
        r"experience",
        r"work history",
        r"employment",
        r"professional experience",
        r"work experience",
        r"career history",
    ],
    ChunkType.EDUCATION: [
        r"education",
        r"academic",
        r"qualifications",
        r"degrees",
        r"educational background",
    ],
    ChunkType.SKILLS: [
        r"skills",
        r"technical skills",
        r"competencies",
        r"expertise",
        r"technologies",
        r"tools",
        r"proficiencies",
    ],
    ChunkType.PROJECTS: [
        r"projects",
        r"personal projects",
        r"portfolio",
        r"side projects",
    ],
    ChunkType.CERTIFICATIONS: [
        r"certifications",
        r"certificates",
        r"licenses",
        r"credentials",
        r"professional certifications",
    ],
}


class TextProcessor:
    """
    Process resume text: chunking and metadata extraction.

    All extraction is heuristic-based and approximate.
    Missing data is expected and acceptable.
    """

    def __init__(self):
        self.settings = get_settings()

    def process_resume(
        self,
        text: str,
        candidate_id: str,
        source_file: Optional[str] = None,
    ) -> Candidate:
        """
        Process a raw resume text into a Candidate with chunks and metadata.

        Args:
            text: Raw resume text
            candidate_id: Unique identifier for this candidate
            source_file: Optional source file path

        Returns:
            Candidate object with chunks and extracted metadata
        """
        # Extract candidate name, email, and location BEFORE cleaning (needs newlines)
        name = self._extract_name(text)
        email = self._extract_email(text)
        header_location = self._extract_location_from_header(text)
        header_is_remote = self._extract_remote_from_header(text)

        # Clean text (removes newlines)
        cleaned_text = self._clean_text(text)

        # Chunk the resume
        chunks = self._chunk_resume(cleaned_text, candidate_id)

        # Extract metadata for each chunk
        for chunk in chunks:
            chunk.metadata = self._extract_chunk_metadata(chunk.text, chunk.chunk_type)

        # Aggregate metadata across chunks
        aggregated_metadata = self._aggregate_metadata(chunks)

        # Override location with header extraction if found (more reliable)
        if header_location:
            aggregated_metadata.location = header_location
        if header_is_remote is not None:
            aggregated_metadata.is_remote = header_is_remote

        return Candidate(
            id=candidate_id,
            name=name,
            email=email,
            full_text=cleaned_text,
            chunks=chunks,
            aggregated_metadata=aggregated_metadata,
            source_file=source_file,
        )

    def _clean_text(self, text: str) -> str:
        """Clean and normalize resume text."""
        # Remove excessive whitespace
        text = re.sub(r"\s+", " ", text)

        # Remove special characters that might cause issues
        text = text.replace("\x00", "")

        # Normalize unicode
        text = text.encode("utf-8", errors="ignore").decode("utf-8")

        return text.strip()

    def _extract_name(self, text: str) -> Optional[str]:
        """
        Extract candidate name from resume header.

        Strategy:
        1. Look at first 10 lines for potential name
        2. Skip lines that are clearly not names (emails, URLs, phone, titles)
        3. Use heuristics to identify name-like patterns
        4. Handle common formats: "Name", "Name | Location", "Dr. Name", etc.
        """
        # Common job titles/roles that might be mistaken for names
        job_titles = {
            "software engineer",
            "senior software engineer",
            "staff engineer",
            "data scientist",
            "machine learning engineer",
            "ml engineer",
            "product manager",
            "project manager",
            "engineering manager",
            "frontend developer",
            "backend developer",
            "full stack developer",
            "fullstack developer",
            "devops engineer",
            "sre",
            "site reliability",
            "data engineer",
            "data analyst",
            "business analyst",
            "ui designer",
            "ux designer",
            "product designer",
            "technical lead",
            "tech lead",
            "team lead",
            "architect",
            "solutions architect",
            "cloud architect",
            "software architect",
            "qa engineer",
            "test engineer",
            "automation engineer",
            "mobile developer",
            "ios developer",
            "android developer",
            "web developer",
            "react developer",
            "python developer",
            "java developer",
            "senior developer",
            "junior developer",
            "principal engineer",
            "staff software engineer",
            "security engineer",
            "network engineer",
            "systems engineer",
            "platform engineer",
            "infrastructure engineer",
        }

        # Words that indicate a line is not a name
        skip_patterns = [
            "@",  # Email
            "http",
            "www.",
            ".com",
            ".org",
            ".io",  # URLs
            "linkedin",
            "github",
            "twitter",  # Social media
            "resume",
            "cv",
            "curriculum vitae",  # Document titles
            "phone",
            "tel:",
            "mobile",  # Phone labels
            "address",
            "street",
            "ave",
            "blvd",  # Address parts
            "objective",
            "summary",
            "profile",
            "about",  # Section headers
            "experience",
            "education",
            "skills",  # Section headers
        ]

        lines = text.split("\n")[:10]

        for line in lines:
            line = line.strip()

            # Skip empty or very long lines
            if not line or len(line) > 60:
                continue

            line_lower = line.lower()

            # Skip lines with obvious non-name patterns
            if any(pattern in line_lower for pattern in skip_patterns):
                continue

            # Skip lines that look like phone numbers
            if re.search(r"[\d\-\(\)]{7,}", line):
                continue

            # Skip lines that are job titles
            if line_lower in job_titles:
                continue

            # Handle "Name | Location" or "Name | Info" format
            if "|" in line:
                parts = line.split("|")
                line = parts[0].strip()

            # Handle "Name, Location" format (but not "Last, First")
            if "," in line:
                parts = line.split(",")
                # If second part looks like a state/location, take first part as name
                if len(parts) == 2:
                    second = parts[1].strip()
                    if len(second) <= 3 or second.lower() in [
                        "usa",
                        "uk",
                        "canada",
                        "remote",
                    ]:
                        line = parts[0].strip()
                    # Check if it's a state name
                    if (
                        second.upper() in US_STATES
                        or second.title() in US_STATES.values()
                    ):
                        line = parts[0].strip()

            # Now check if the cleaned line looks like a name
            words = line.split()

            # Names typically have 2-4 words
            if not (1 <= len(words) <= 5):
                continue

            # Check for name-like characteristics
            # Allow for: "Dr.", "Jr.", "Sr.", "III", initials like "J."
            name_parts = []
            is_valid_name = True

            for i, word in enumerate(words):
                # Handle titles at the beginning
                if i == 0 and word.rstrip(".").lower() in [
                    "dr",
                    "mr",
                    "ms",
                    "mrs",
                    "prof",
                ]:
                    name_parts.append(word)
                    continue

                # Handle suffixes at the end
                if i == len(words) - 1 and word.rstrip(".").lower() in [
                    "jr",
                    "sr",
                    "ii",
                    "iii",
                    "iv",
                    "phd",
                    "md",
                ]:
                    name_parts.append(word)
                    continue

                # Handle initials like "J." or "A."
                if len(word) <= 2 and word.endswith("."):
                    name_parts.append(word)
                    continue

                # Regular name word: should start with capital (or be all caps)
                if word[0].isupper() or word.isupper():
                    # Check it's not a common non-name word
                    if word.lower() not in ["the", "and", "of", "at", "in", "for"]:
                        name_parts.append(word)
                        continue

                # Allow hyphenated names
                if "-" in word:
                    parts = word.split("-")
                    if all(p[0].isupper() for p in parts if p):
                        name_parts.append(word)
                        continue

                # If we get here with a lowercase word (not title/suffix), might not be a name
                # But allow it if it's short (might be a name from another culture)
                if len(word) <= 10 and word.isalpha():
                    name_parts.append(word)
                    continue

                is_valid_name = False
                break

            # Need at least 2 name parts for a valid name (or 1 if preceded by title)
            if is_valid_name and len(name_parts) >= 2:
                return " ".join(name_parts)

            # Special case: "Dr. Lastname" is valid
            if is_valid_name and len(name_parts) == 2:
                if name_parts[0].rstrip(".").lower() in [
                    "dr",
                    "mr",
                    "ms",
                    "mrs",
                    "prof",
                ]:
                    return " ".join(name_parts)

        return None

    def _extract_email(self, text: str) -> Optional[str]:
        """Extract email address from resume."""
        email_pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        match = re.search(email_pattern, text)
        return match.group(0) if match else None

    def _extract_location_from_header(self, text: str) -> Optional[str]:
        """
        Extract location from the header/contact section of a resume.
        This is more accurate than extracting from chunks because location
        is typically in the first few lines.

        Common formats:
        - "City, ST" (e.g., "Seattle, WA")
        - "City, State" (e.g., "Seattle, Washington")
        - "City, Country" (e.g., "London, UK")
        - "City, ST | Remote" or "City, ST | Open to Remote"
        """
        # Look at first 10 lines (header area)
        lines = text.split("\n")[:10]

        for line in lines:
            line = line.strip()
            if not line or len(line) > 100:
                continue

            # Skip lines that look like section headers
            if any(
                header in line.lower()
                for header in [
                    "experience",
                    "education",
                    "skills",
                    "summary",
                    "about",
                    "objective",
                ]
            ):
                continue

            # Skip lines with URLs
            if "http" in line.lower() or "www." in line.lower():
                continue

            # Pattern 1: City, STATE_ABBREV (e.g., "Seattle, WA", "San Francisco, CA")
            state_abbrev_pattern = r"([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b"
            match = re.search(state_abbrev_pattern, line)
            if match:
                city = match.group(1).strip()
                state_abbrev = match.group(2).upper()
                if state_abbrev in US_STATES:
                    # Validate city is reasonable
                    if len(city) < 30 and not any(c.isdigit() for c in city):
                        return f"{city}, {state_abbrev}"

            # Pattern 2: City, Full State Name (e.g., "Austin, Texas")
            for abbrev, state_name in US_STATES.items():
                pattern = rf"([A-Z][a-zA-Z\s]+),\s*{state_name}\b"
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    city = match.group(1).strip()
                    if len(city) < 30 and not any(c.isdigit() for c in city):
                        return f"{city}, {abbrev}"

            # Pattern 3: City, Country (e.g., "London, UK", "Toronto, Canada")
            for country in COUNTRIES:
                pattern = rf"([A-Z][a-zA-Z\s]+),\s*{country}\b"
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    city = match.group(1).strip()
                    if len(city) < 30 and not any(c.isdigit() for c in city):
                        return f"{city}, {country.title()}"

            # Pattern 4: Just a city name (validate against known cities)
            line_lower = line.lower()
            for city in MAJOR_CITIES:
                # Check if city appears as a standalone word/phrase
                if re.search(rf"\b{re.escape(city)}\b", line_lower):
                    # Make sure it's not part of a company name or other context
                    # by checking the line doesn't have too many other words
                    words = line.split()
                    if len(words) <= 6:  # Short line, likely contact info
                        # Capitalize properly
                        return city.title()

            # Pattern 5: Location with "Based in" prefix
            based_pattern = r"(?:based\s+in|located\s+in|location)[:\s]+([A-Za-z\s,]+)"
            match = re.search(based_pattern, line, re.IGNORECASE)
            if match:
                location = match.group(1).strip()
                # Remove trailing pipe and anything after
                location = re.split(r"\s*\|\s*", location)[0].strip()
                if len(location) < 50 and location:
                    return location

        return None

    def _extract_remote_from_header(self, text: str) -> Optional[bool]:
        """
        Extract remote work preference from the header area.
        Common patterns: "Open to Remote", "Remote", "| Remote"
        """
        # Look at first 10 lines
        lines = text.split("\n")[:10]
        header_text = " ".join(lines).lower()

        remote_positive = [
            "open to remote",
            "remote friendly",
            "remote work",
            "work from home",
            "| remote",
            ", remote",
            "fully remote",
            "100% remote",
            "wfh",
            "distributed",
        ]

        remote_negative = [
            "on-site only",
            "onsite only",
            "in-office only",
            "office-based only",
            "no remote",
            "not remote",
        ]

        for pattern in remote_positive:
            if pattern in header_text:
                return True

        for pattern in remote_negative:
            if pattern in header_text:
                return False

        return None

    def _chunk_resume(
        self,
        text: str,
        candidate_id: str,
    ) -> List[CandidateChunk]:
        """
        Split resume into semantic chunks based on section headers.

        Strategy:
        1. Identify section headers
        2. Split on headers
        3. If no headers found, chunk by size
        """
        chunks = []

        # Try to find section boundaries
        sections = self._identify_sections(text)

        if len(sections) > 1:
            # We found sections - use them as chunks
            for idx, (section_type, section_text) in enumerate(sections):
                # Further split if section is too long
                sub_chunks = self._split_long_text(section_text)
                for sub_idx, sub_text in enumerate(sub_chunks):
                    chunk_idx = len(chunks)
                    chunks.append(
                        CandidateChunk(
                            candidate_id=candidate_id,
                            chunk_index=chunk_idx,
                            chunk_type=section_type,
                            text=sub_text.strip(),
                        )
                    )
        else:
            # No clear sections - chunk by size
            text_chunks = self._split_long_text(text)
            for idx, chunk_text in enumerate(text_chunks):
                chunks.append(
                    CandidateChunk(
                        candidate_id=candidate_id,
                        chunk_index=idx,
                        chunk_type=ChunkType.OTHER,
                        text=chunk_text.strip(),
                    )
                )

        return chunks

    def _identify_sections(self, text: str) -> List[Tuple[ChunkType, str]]:
        """
        Identify sections in resume based on headers.
        Returns list of (section_type, section_text) tuples.
        """
        sections = []

        # Build pattern to find all section headers
        all_patterns = []
        pattern_to_type = {}

        for section_type, patterns in SECTION_PATTERNS.items():
            for pattern in patterns:
                full_pattern = (
                    rf"(?:^|\n)\s*(?:[\d\.\-]*\s*)?({pattern})\s*[\:\-]?\s*(?:\n|$)"
                )
                all_patterns.append(full_pattern)
                pattern_to_type[pattern] = section_type

        # Find all section headers and their positions
        header_positions = []
        for section_type, patterns in SECTION_PATTERNS.items():
            for pattern in patterns:
                regex = rf"(?:^|\n)\s*(?:[\d\.\-]*\s*)?({pattern})\s*[\:\-]?\s*(?:\n|$)"
                for match in re.finditer(regex, text, re.IGNORECASE):
                    header_positions.append((match.start(), match.end(), section_type))

        # Sort by position
        header_positions.sort(key=lambda x: x[0])

        if not header_positions:
            # No sections found - return entire text as one section
            return [(ChunkType.OTHER, text)]

        # Extract sections between headers
        for i, (start, end, section_type) in enumerate(header_positions):
            # Section content is from end of header to start of next header (or end of text)
            if i + 1 < len(header_positions):
                section_end = header_positions[i + 1][0]
            else:
                section_end = len(text)

            section_text = text[end:section_end].strip()
            if section_text:
                sections.append((section_type, section_text))

        # Include any content before first header as summary/other
        if header_positions[0][0] > 0:
            intro_text = text[: header_positions[0][0]].strip()
            if intro_text:
                sections.insert(0, (ChunkType.SUMMARY, intro_text))

        return sections

    def _split_long_text(self, text: str) -> List[str]:
        """
        Split long text into smaller chunks while preserving context.
        """
        max_size = self.settings.chunk_size
        overlap = self.settings.chunk_overlap

        if len(text) <= max_size:
            return [text]

        chunks = []

        # Try to split on paragraph boundaries
        paragraphs = re.split(r"\n\s*\n", text)

        current_chunk = ""
        for para in paragraphs:
            if len(current_chunk) + len(para) <= max_size:
                current_chunk += ("\n\n" if current_chunk else "") + para
            else:
                if current_chunk:
                    chunks.append(current_chunk)

                # If paragraph itself is too long, split by sentences
                if len(para) > max_size:
                    sentences = re.split(r"(?<=[.!?])\s+", para)
                    current_chunk = ""
                    for sentence in sentences:
                        if len(current_chunk) + len(sentence) <= max_size:
                            current_chunk += (" " if current_chunk else "") + sentence
                        else:
                            if current_chunk:
                                chunks.append(current_chunk)
                            current_chunk = sentence
                else:
                    current_chunk = para

        if current_chunk:
            chunks.append(current_chunk)

        return chunks

    def _extract_chunk_metadata(
        self,
        text: str,
        chunk_type: ChunkType,
    ) -> ExtractedMetadata:
        """
        Extract metadata from a chunk of text.
        All extraction is approximate and heuristic-based.
        """
        text_lower = text.lower()

        # Extract skills
        skills = self._extract_skills(text_lower)

        # Extract years of experience
        experience_years = self._extract_experience_years(text)

        # Infer role category
        role_category = self._infer_role_category(text_lower)

        # Extract location
        location = self._extract_location(text)

        # Check for remote mentions
        is_remote = self._check_remote(text_lower)

        # Extract companies (from experience sections)
        companies = []
        if chunk_type == ChunkType.EXPERIENCE:
            companies = self._extract_companies(text)

        # Extract education level
        education_level = None
        if chunk_type == ChunkType.EDUCATION:
            education_level = self._extract_education_level(text_lower)

        # Estimate confidence based on what was found
        confidence = self._estimate_confidence(
            skills, experience_years, role_category, location
        )

        return ExtractedMetadata(
            skills=skills,
            experience_years=experience_years,
            role_category=role_category,
            location=location,
            is_remote=is_remote,
            education_level=education_level,
            companies=companies,
            extraction_confidence=confidence,
        )

    def _extract_skills(self, text: str) -> List[str]:
        """Extract skills from text using pattern matching."""
        found_skills = []

        # Normalize text
        text = text.lower()

        for skill in SKILL_PATTERNS:
            # Use word boundaries to avoid false matches
            pattern = rf"\b{re.escape(skill)}\b"
            if re.search(pattern, text):
                found_skills.append(skill)

        return list(set(found_skills))

    def _extract_experience_years(self, text: str) -> Optional[float]:
        """
        Extract approximate years of experience.

        Strategies:
        1. Look for explicit mentions ("5 years experience")
        2. Look for date ranges and calculate duration
        """
        # Pattern 1: Explicit mentions
        explicit_patterns = [
            r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)",
            r"(?:experience|exp)[\:\s]*(\d+)\+?\s*(?:years?|yrs?)",
            r"(\d+)\+?\s*(?:years?|yrs?)\s*in\s*\w+",
        ]

        for pattern in explicit_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1))
                except:
                    pass

        # Pattern 2: Date ranges (e.g., "2018 - 2023" or "2018-present")
        date_pattern = (
            r"(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current|now)"
        )
        dates = re.findall(date_pattern, text, re.IGNORECASE)

        if dates:
            total_years = 0
            current_year = 2026  # Current year from context

            for start, end in dates:
                try:
                    start_year = int(start)
                    if end.lower() in ["present", "current", "now"]:
                        end_year = current_year
                    else:
                        end_year = int(end)

                    total_years += max(0, end_year - start_year)
                except:
                    pass

            if total_years > 0:
                return float(total_years)

        return None

    def _infer_role_category(self, text: str) -> Optional[RoleCategory]:
        """Infer role category from text."""
        scores = {category: 0 for category in RoleCategory}

        for category, keywords in ROLE_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    scores[category] += 1

        # Find category with highest score
        max_score = max(scores.values())
        if max_score == 0:
            return None

        for category, score in scores.items():
            if score == max_score:
                return category

        return None

    def _extract_location(self, text: str) -> Optional[str]:
        """
        Extract location from chunk text (fallback method).
        The primary location extraction happens in _extract_location_from_header.
        """
        # Pattern 1: City, STATE_ABBREV format (validated against US_STATES)
        state_abbrev_pattern = r"([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b"
        for match in re.finditer(state_abbrev_pattern, text):
            city = match.group(1).strip()
            state_abbrev = match.group(2).upper()
            # Validate state abbreviation is a real US state
            if state_abbrev in US_STATES:
                # Validate city looks reasonable (not too long, no digits, not a tech word)
                tech_words = {"github", "gitlab", "bitbucket", "linkedin", "aws", "gcp"}
                if (
                    len(city) < 30
                    and not any(c.isdigit() for c in city)
                    and city.lower() not in tech_words
                ):
                    return f"{city}, {state_abbrev}"

        # Pattern 2: "based in" or "located in" phrases (with word boundary)
        # Use word boundary to avoid matching "geolocation" as "location"
        based_pattern = r"\b(?:location|based in|located in)[\:\s]+([A-Za-z\s,]+)"
        match = re.search(based_pattern, text, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            location = re.sub(r"\s+", " ", location)
            # Remove trailing pipe and anything after
            location = re.split(r"\s*\|\s*", location)[0].strip()
            # Validate it looks like a location (has comma or reasonable length)
            if len(location) < 50 and location and len(location) > 2:
                # Skip if it looks like a tech term
                if not any(
                    tech in location.lower()
                    for tech in ["feature", "api", "code", "app"]
                ):
                    return location

        return None

    def _check_remote(self, text: str) -> Optional[bool]:
        """Check if remote work is mentioned."""
        remote_positive = ["remote", "work from home", "wfh", "distributed", "anywhere"]
        remote_negative = ["on-site", "onsite", "in-office", "office-based"]

        for pattern in remote_positive:
            if pattern in text:
                return True

        for pattern in remote_negative:
            if pattern in text:
                return False

        return None

    def _extract_companies(self, text: str) -> List[str]:
        """Extract company names from experience section."""
        # This is very approximate - company name extraction is hard
        # Look for patterns like "at Company" or "Company, Inc."
        companies = []

        # Pattern for company names followed by typical suffixes
        suffix_pattern = r"([A-Z][A-Za-z\s]+)\s*(?:Inc\.?|LLC|Corp\.?|Ltd\.?|Company)"
        for match in re.finditer(suffix_pattern, text):
            company = match.group(1).strip()
            if len(company) < 50:
                companies.append(company)

        return list(set(companies))[:5]  # Limit to 5

    def _extract_education_level(self, text: str) -> Optional[str]:
        """Extract highest education level."""
        education_levels = [
            ("phd", "PhD"),
            ("ph.d", "PhD"),
            ("doctorate", "PhD"),
            ("master", "Masters"),
            ("m.s.", "Masters"),
            ("m.a.", "Masters"),
            ("mba", "MBA"),
            ("bachelor", "Bachelors"),
            ("b.s.", "Bachelors"),
            ("b.a.", "Bachelors"),
            ("b.e.", "Bachelors"),
            ("b.tech", "Bachelors"),
            ("associate", "Associates"),
        ]

        for pattern, level in education_levels:
            if pattern in text:
                return level

        return None

    def _estimate_confidence(
        self,
        skills: List[str],
        experience_years: Optional[float],
        role_category: Optional[RoleCategory],
        location: Optional[str],
    ) -> float:
        """Estimate confidence in extracted metadata."""
        score = 0.3  # Base score

        if skills:
            score += min(0.3, len(skills) * 0.03)

        if experience_years is not None:
            score += 0.2

        if role_category is not None:
            score += 0.1

        if location is not None:
            score += 0.1

        return min(1.0, score)

    def _aggregate_metadata(self, chunks: List[CandidateChunk]) -> ExtractedMetadata:
        """Aggregate metadata from all chunks into a single summary."""
        all_skills = set()
        experience_years = None
        role_category = None
        location = None
        is_remote = None
        education_level = None
        all_companies = set()

        for chunk in chunks:
            meta = chunk.metadata

            all_skills.update(meta.skills)

            if meta.experience_years is not None:
                if experience_years is None or meta.experience_years > experience_years:
                    experience_years = meta.experience_years

            if meta.role_category is not None and role_category is None:
                role_category = meta.role_category

            if meta.location is not None and location is None:
                location = meta.location

            if meta.is_remote is not None and is_remote is None:
                is_remote = meta.is_remote

            if meta.education_level is not None:
                education_level = meta.education_level

            all_companies.update(meta.companies)

        # Calculate aggregate confidence
        confidence = self._estimate_confidence(
            list(all_skills), experience_years, role_category, location
        )

        return ExtractedMetadata(
            skills=list(all_skills),
            experience_years=experience_years,
            role_category=role_category,
            location=location,
            is_remote=is_remote,
            education_level=education_level,
            companies=list(all_companies),
            extraction_confidence=confidence,
        )


# Global instance
_text_processor: Optional[TextProcessor] = None


def get_text_processor() -> TextProcessor:
    """Get or create the global text processor instance."""
    global _text_processor
    if _text_processor is None:
        _text_processor = TextProcessor()
    return _text_processor
