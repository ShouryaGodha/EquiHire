# EquiHire: Ethical AI Recruitment Assistant

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-green.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

**A production-grade, explainable AI-powered recruitment system that addresses bias and exclusion in modern hiring through semantic search, soft filtering, and transparent scoring.**

[Features](#-key-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [API Reference](#-api-reference)

</div>

---

## 📋 Project Overview

**EquiHire** is an ethical AI recruitment assistant designed to solve critical problems in modern hiring:

### The Problem
Traditional Applicant Tracking Systems (ATS) rely on keyword matching and hard filters that:
- **Exclude qualified candidates** due to imperfect resume parsing
- **Introduce bias** through exact terminology requirements
- **Lack transparency** in how candidates are ranked
- **Ignore context** by treating each search as isolated

### Our Solution
EquiHire implements a fundamentally different approach:

| Traditional ATS | EquiHire |
|-----------------|----------|
| Keyword matching (TF-IDF/BM25) | **Semantic embeddings** (dense vectors) |
| Hard filters (must match or excluded) | **Soft filters** (boost matching, don't exclude) |
| Binary scoring (match/no-match) | **Composite weighted scoring** with 6 components |
| No explainability | **Full transparency** (matched/missing skills, evidence) |
| Stateless search | **Session memory** with conversational follow-ups |

### Core Philosophy
> *"No candidate should be algorithmically eliminated due to metadata extraction errors or terminology differences."*

All filters in EquiHire are **soft by default** — they influence ranking, not exclusion.

---

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🔍 **Semantic Search** | Find candidates using natural language job descriptions — "ML engineer with NLP experience" matches "machine learning", "natural language processing", etc. |
| 🎚️ **Soft Filtering** | Filters rank candidates by boosting matches without hard exclusions |
| 📊 **Transparent Scoring** | Every score component is visible: semantic (40%), skills (25%), experience (15%), role (10%), availability (5%), feedback (5%) |
| 💬 **Conversational Refinement** | Follow-up questions with session memory: "Show me candidates with more cloud experience" |
| 🛡️ **Ethical Design** | No protected attributes in scoring, humans remain in decision loop |
| 📝 **Evidence Grounding** | Each result includes resume snippets showing WHY the candidate matched |


## 📦 Installation

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Python** | 3.10+ | Backend runtime |
| **Node.js** | 18+ | Frontend build |
| **npm** | 9+ | Package management |
| **Docker** | 20+ | Qdrant database (or use Qdrant Cloud) |
| **Git** | 2.0+ | Repository cloning |

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/equihire.git
cd equihire
```

### Step 2: Set Up Qdrant Vector Database

**Option A: Using Docker (Recommended for local development)**

```bash
# Pull and run Qdrant
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Verify Qdrant is running
curl http://localhost:6333/health
# Expected: {"title":"qdrant - vector search engine","version":"..."}
```

**Option B: Using Qdrant Cloud (Production)**

1. Create account at https://cloud.qdrant.io/
2. Create a new cluster
3. Copy your API key and cluster URL
4. Update `.env` with cloud credentials

### Step 3: Set Up Backend

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install Python dependencies
pip install -r requirements.txt

# Download required NLTK data (for text processing)
python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords'); nltk.download('averaged_perceptron_tagger')"

# Copy environment configuration
cp .env.example .env

# (Optional) Edit .env if using Qdrant Cloud or custom settings
# nano .env  # or use any text editor
```

**First-time setup: Download embedding models**

The first time you run the backend, sentence-transformers will download the embedding models (~90MB):
- `all-MiniLM-L6-v2` (primary embeddings)
- `cross-encoder/ms-marco-MiniLM-L-6-v2` (reranking)

This is automatic but requires internet connection.

### Step 4: Set Up Frontend

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install Node.js dependencies
npm install

# (Optional) Build for production
npm run build
```

### Step 5: Initialize Qdrant Collections

Collections are automatically created when the backend starts. To manually verify:

```bash
# With backend running, check collections
curl http://localhost:6333/collections

# Expected response includes:
# - candidate_chunks (resume embeddings)
# - recruiter_memory (session memory)
```

---

## 🚀 Quick Start

### 1. Start All Services

**Terminal 1: Qdrant (if using Docker)**
```bash
# If not already running
docker start qdrant
```

**Terminal 2: Backend Server**
```bash
cd backend
source venv/bin/activate  # Activate virtual environment
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started reloader process
INFO:     Starting up recruitment assistant...
INFO:     Initializing Qdrant collections...
INFO:     Startup complete!
```

**Terminal 3: Frontend Server**
```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v5.0.10  ready in 500 ms
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

### 2. Verify Installation

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Backend Health | http://localhost:8000/api/health | `{"status": "healthy", ...}` |
| API Documentation | http://localhost:8000/docs | Swagger UI |
| Frontend | http://localhost:3000 | EquiHire UI |
| Qdrant Dashboard | http://localhost:6333/dashboard | Qdrant Web UI |

### 3. Ingest Sample Resumes

**Option A: Using the Admin UI**
1. Open http://localhost:3000/admin
2. Click **"Create Sample Resumes"**
3. Wait for confirmation (creates 50+ sample candidates)

**Option B: Using API (recommended for automation)**

```bash
# Ingest sample resumes from the data directory
curl -X POST "http://localhost:8000/api/ingest/directory" \
  -H "Content-Type: application/json" \
  -d '{"directory": "data/resumes/samples", "extensions": [".txt"], "recursive": true}'

# Expected response:
# {
#   "processed": 50,
#   "successful": 50,
#   "failed": 0,
#   "results": [...]
# }
```

**Option C: Using Python script**

```bash
cd backend
source venv/bin/activate

python -c "
from app.services import get_ingestion_pipeline
pipeline = get_ingestion_pipeline()
result = pipeline.ingest_directory('data/resumes/samples', extensions=['.txt'])
print(f'Ingested {result.successful} resumes')
"
```

### 4. Test Search

Try these sample queries in the UI or via API:

```bash
# Search for backend engineers
curl -X POST "http://localhost:8000/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "Senior Backend Engineer with Python and AWS, 5+ years experience"}'

# Search for ML engineers
curl -X POST "http://localhost:8000/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "Machine Learning Engineer with NLP and transformers experience"}'

# Follow-up refinement (use session_id from previous response)
curl -X POST "http://localhost:8000/api/followup" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "YOUR_SESSION_ID", "question": "Show me candidates with more Kubernetes experience"}'
```

---

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Search candidates with job description |
| `POST` | `/api/followup` | Refine search with session memory |
| `POST` | `/api/ingest/text` | Ingest single resume from text |
| `POST` | `/api/ingest/file` | Ingest resume from file upload |
| `POST` | `/api/ingest/directory` | Batch ingest from directory |
| `POST` | `/api/ingest/samples` | Create sample resumes |
| `GET` | `/api/candidates/{id}` | Get candidate details |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/stats` | System statistics |

### Search Candidates

```bash
POST /api/search
Content-Type: application/json

{
  "query": "Backend engineer with Python and AWS, 5+ years experience",
  "top_k": 10,
  "session_id": null  // Optional: for session continuity
}
```

**Response:**
```json
{
  "candidates": [
    {
      "candidate_id": "uuid",
      "name": "John Doe",
      "score": 0.87,
      "score_breakdown": {
        "semantic": 0.91,
        "skills": 0.85,
        "experience": 0.90,
        "role": 1.0,
        "availability": 0.7,
        "feedback": 0.5
      },
      "matched_skills": ["Python", "AWS", "FastAPI"],
      "missing_skills": ["Kubernetes"],
      "explanation": "Strong semantic match. Excellent skill alignment (6 matched).",
      "evidence": [...]
    }
  ],
  "applied_filters": {...},
  "session_id": "abc123"
}
```

### Follow-up Question

```bash
POST /api/followup
Content-Type: application/json

{
  "session_id": "abc123",
  "question": "Show me candidates with more Kubernetes experience",
  "refinements": {
    "add_skills": ["Kubernetes", "Docker"],
    "min_experience": 6
  }
}
```

## ⚙️ Configuration

### Environment Variables (`backend/.env`)

```env
# Qdrant Configuration
QDRANT_HOST=localhost           # Qdrant host (localhost or cloud URL)
QDRANT_PORT=6333                # Qdrant HTTP port
QDRANT_API_KEY=                 # API key (required for Qdrant Cloud)

# Embedding Model Configuration
EMBEDDING_MODEL=all-MiniLM-L6-v2    # Sentence-transformer model
EMBEDDING_DIMENSION=384              # Must match model output

# Reranker Configuration
RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
USE_RERANKER=true               # Enable/disable reranking stage

# Search Configuration
DEFAULT_TOP_K=20                # Default number of results
CHUNK_SIZE=512                  # Max characters per resume chunk
CHUNK_OVERLAP=50                # Overlap between chunks

# Scoring Weights (must sum to 1.0)
WEIGHT_SEMANTIC=0.4             # Vector similarity weight
WEIGHT_SKILLS=0.25              # Skill match weight
WEIGHT_EXPERIENCE=0.15          # Experience fit weight
WEIGHT_ROLE=0.1                 # Role category weight
WEIGHT_AVAILABILITY=0.05        # Location/remote weight
WEIGHT_FEEDBACK=0.05            # Feedback weight (placeholder)

# Application
DEBUG=true
LOG_LEVEL=INFO
```

### Frontend Configuration

The frontend uses Vite with proxy configuration ([vite.config.ts](frontend/vite.config.ts)):

```typescript
server: {
    port: 3000,           // Frontend dev server port
    proxy: {
        '/api': {
            target: 'http://localhost:8000',  // Backend URL
            changeOrigin: true,
        },
    },
},
```

### Qdrant Cloud Configuration

For production with Qdrant Cloud:

```env
QDRANT_HOST=your-cluster-url.qdrant.io
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key-here
```

---

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Connection refused` on port 6333 | Ensure Qdrant is running: `docker start qdrant` |
| `ModuleNotFoundError` | Activate venv: `source venv/bin/activate` |
| CORS errors in browser | Check backend CORS config includes frontend URL |
| Slow first search | First load downloads embedding models (~90MB) |
| No candidates found | Run data ingestion first (see Step 3 in Quick Start) |
| Port 3000 already in use | Kill process: `lsof -ti:3000 \| xargs kill -9` |
| Port 8000 already in use | Kill process: `lsof -ti:8000 \| xargs kill -9` |

### Logs

```bash
# Backend logs (with --reload)
# Logs appear in terminal running uvicorn

# Check Qdrant logs
docker logs qdrant

# Frontend logs
# Appear in browser console (F12 → Console)
```

### Reset Everything

```bash
# Stop all services
docker stop qdrant

# Remove Qdrant data
docker rm qdrant
rm -rf qdrant_storage/

# Remove Python environment
rm -rf backend/venv

# Remove Node modules
rm -rf frontend/node_modules

# Start fresh with installation steps
```
