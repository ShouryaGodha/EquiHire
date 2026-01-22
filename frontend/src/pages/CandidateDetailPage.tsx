import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    User,
    MapPin,
    Briefcase,
    Code,
    Loader2,
    AlertCircle,
    CheckCircle,
    Mail,
    Globe,
    Phone,
    Printer,
    ChevronDown,
    Database,
} from 'lucide-react';
import { recruitmentApi } from '../api';

// Parse resume text into structured sections
interface ResumeSection {
    title: string;
    content: string;
    type: 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'projects' | 'other';
}

interface ParsedResume {
    name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin: string | null;
    sections: ResumeSection[];
}

function parseResumeFromChunks(chunks: Array<Record<string, unknown>>): ParsedResume {
    // Combine all chunk text
    const fullText = chunks
        .sort((a, b) => (typeof a.chunk_index === 'number' && typeof b.chunk_index === 'number'
            ? a.chunk_index - b.chunk_index : 0))
        .map(c => typeof c.text === 'string' ? c.text : '')
        .join('\n\n');

    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract contact info from first few lines
    let name = '';
    let email: string | null = null;
    let phone: string | null = null;
    let location: string | null = null;
    let linkedin: string | null = null;

    // First non-empty line is usually the name
    if (lines.length > 0) {
        const firstLine = lines[0];
        // Check if it looks like a name (not a section header, not an email)
        if (!firstLine.includes('@') && !firstLine.match(/^[A-Z\s]+$/) && firstLine.length < 50) {
            name = firstLine;
        }
    }

    // Look for email, phone, location in first ~10 lines
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];

        // Email
        const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch && !email) email = emailMatch[0];

        // Phone
        const phoneMatch = line.match(/(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch && !phone) phone = phoneMatch[0];

        // LinkedIn
        if (line.toLowerCase().includes('linkedin.com') || line.toLowerCase().includes('linkedin:')) {
            linkedin = line;
        }

        // Location (usually contains city, state pattern or "Remote")
        if (!location && (line.includes(',') || line.toLowerCase().includes('remote'))) {
            const locationMatch = line.match(/([A-Za-z\s]+,\s*[A-Z]{2})|([A-Za-z\s]+\s*\|\s*(?:Open to\s+)?Remote)/i);
            if (locationMatch) location = locationMatch[0];
        }
    }

    // Parse sections
    const sectionHeaders = [
        { pattern: /^(PROFESSIONAL\s+)?SUMMARY|PROFILE|OBJECTIVE|ABOUT(\s+ME)?$/i, type: 'summary' as const },
        { pattern: /^(WORK\s+)?EXPERIENCE|EMPLOYMENT(\s+HISTORY)?|CAREER(\s+HISTORY)?$/i, type: 'experience' as const },
        { pattern: /^EDUCATION|ACADEMIC|QUALIFICATIONS$/i, type: 'education' as const },
        { pattern: /^(TECHNICAL\s+)?SKILLS|TECHNOLOGIES|COMPETENCIES|EXPERTISE$/i, type: 'skills' as const },
        { pattern: /^CERTIFICATIONS?|LICENSES?|CREDENTIALS$/i, type: 'certifications' as const },
        { pattern: /^PROJECTS?|PORTFOLIO$/i, type: 'projects' as const },
        { pattern: /^AWARDS?|ACHIEVEMENTS?|HONORS?$/i, type: 'other' as const },
        { pattern: /^PUBLICATIONS?|RESEARCH$/i, type: 'other' as const },
        { pattern: /^LANGUAGES?$/i, type: 'other' as const },
        { pattern: /^(VOLUNTEER|COMMUNITY)(\s+WORK)?$/i, type: 'other' as const },
    ];

    const sections: ResumeSection[] = [];
    let currentSection: ResumeSection | null = null;
    let contentLines: string[] = [];
    let skipContactLines = true;

    for (const line of lines) {
        // Check if this line is a section header
        let foundHeader = false;
        for (const header of sectionHeaders) {
            if (header.pattern.test(line)) {
                // Save previous section
                if (currentSection && contentLines.length > 0) {
                    currentSection.content = contentLines.join('\n');
                    sections.push(currentSection);
                }
                currentSection = { title: line, content: '', type: header.type };
                contentLines = [];
                foundHeader = true;
                skipContactLines = false;
                break;
            }
        }

        if (!foundHeader) {
            // Skip contact info lines at the beginning
            if (skipContactLines) {
                if (line === name || line.includes('@') || line.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/) ||
                    line.toLowerCase().includes('linkedin') || line.includes('|')) {
                    continue;
                }
            }

            if (currentSection) {
                contentLines.push(line);
            }
        }
    }

    // Save last section
    if (currentSection && contentLines.length > 0) {
        currentSection.content = contentLines.join('\n');
        sections.push(currentSection);
    }

    return { name, email, phone, location, linkedin, sections };
}

// Collapsible Raw Chunks Section Component
function RawChunksSection({ chunks, metadata }: { chunks: Array<Record<string, unknown>>; metadata: Record<string, unknown> }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="mt-6 bg-white shadow-lg rounded-xl overflow-hidden print:hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                        <Database className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-sm font-semibold text-foreground">Raw Data & Chunks</h3>
                        <p className="text-xs text-muted-foreground">View extracted text chunks and metadata</p>
                    </div>
                </div>
                <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="border-t border-border">
                    {/* Chunks */}
                    <div className="p-6 space-y-4">
                        <h4 className="text-sm font-medium text-foreground">Resume Chunks ({chunks.length})</h4>
                        {chunks.map((chunk: Record<string, unknown>, idx: number) => (
                            <div
                                key={idx}
                                className="bg-slate-50 border border-border rounded-lg p-4"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-primary uppercase tracking-wide">
                                        {typeof chunk.chunk_type === 'string' ? chunk.chunk_type.replace('_', ' ') : 'Section'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Chunk #{typeof chunk.chunk_index === 'number' ? chunk.chunk_index + 1 : idx + 1}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                    {typeof chunk.text === 'string' ? chunk.text : ''}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Metadata */}
                    <div className="p-6 pt-0">
                        <h4 className="text-sm font-medium text-foreground mb-3">Extraction Metadata</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                            This metadata was automatically extracted from the resume text. It may be incomplete or approximate.
                        </p>
                        <pre className="text-xs text-muted-foreground bg-slate-50 p-4 rounded-lg overflow-auto border border-border max-h-64">
                            {JSON.stringify(metadata, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CandidateDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data, isLoading, error } = useQuery({
        queryKey: ['candidate', id],
        queryFn: () => recruitmentApi.getCandidate(id!),
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background">
                <header className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <h1 className="text-lg font-semibold text-foreground">Error</h1>
                </header>
                <div className="max-w-3xl mx-auto p-6">
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
                        <div className="flex items-center space-x-3">
                            <AlertCircle className="w-6 h-6 text-destructive" />
                            <div>
                                <h3 className="font-medium text-destructive">Error Loading Candidate</h3>
                                <p className="text-sm text-destructive/80 mt-1">
                                    {error instanceof Error ? error.message : 'Failed to load candidate details'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-background">
                <header className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <h1 className="text-lg font-semibold text-foreground">Not Found</h1>
                </header>
                <div className="max-w-3xl mx-auto p-6">
                    <div className="bg-secondary border border-border rounded-xl p-6 text-center">
                        <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground">Candidate Not Found</h3>
                    </div>
                </div>
            </div>
        );
    }

    const { metadata, chunks } = data;
    const meta = metadata as Record<string, unknown>;

    // Parse resume from chunks
    const parsedResume = parseResumeFromChunks(chunks);

    // Use parsed name or fallback to metadata
    const displayName = parsedResume.name || (typeof meta.name === 'string' ? meta.name : null) || `Candidate ${id?.slice(0, 8)}`;

    // Use location from parsed resume or metadata
    const displayLocation = parsedResume.location || (typeof meta.location === 'string' ? meta.location : null);
    const displayEmail = parsedResume.email;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-100 print:bg-white">
            {/* Header Navigation - Hide in print */}
            <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-card print:hidden">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">
                            Candidate Profile
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            ID: {id?.slice(0, 8)}...
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-subtle"
                    >
                        <Printer className="w-4 h-4" />
                        Print
                    </button>
                </div>
            </header>

            {/* Resume Container */}
            <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-0">
                {/* Resume Paper */}
                <div className="bg-white shadow-xl rounded-xl overflow-hidden print:shadow-none print:rounded-none">

                    {/* Resume Header - Name & Contact */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-8 py-10 border-b border-border">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                            <div className="flex items-start gap-5">
                                <div className="bg-primary/10 p-4 rounded-full print:bg-slate-100">
                                    <User className="w-10 h-10 text-primary print:text-slate-700" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-foreground tracking-tight">
                                        {displayName}
                                    </h1>
                                    <p className="text-lg text-primary font-medium mt-1">
                                        {typeof meta.role_category === 'string'
                                            ? meta.role_category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                            : 'Professional'}
                                    </p>

                                    {/* Quick Stats */}
                                    <div className="flex flex-wrap items-center gap-4 mt-4">
                                        {!!meta.experience_years && (
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <Briefcase className="w-4 h-4" />
                                                <span>{String(meta.experience_years)}+ years experience</span>
                                            </div>
                                        )}
                                        {displayLocation && (
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <MapPin className="w-4 h-4" />
                                                <span>{displayLocation}</span>
                                            </div>
                                        )}
                                        {!!meta.is_remote && (
                                            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                                                <Globe className="w-4 h-4" />
                                                <span>Open to Remote</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Contact Info */}
                            <div className="flex flex-col gap-2 text-sm md:text-right">
                                {displayEmail && (
                                    <a href={`mailto:${displayEmail}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors md:flex-row-reverse">
                                        <Mail className="w-4 h-4" />
                                        <span>{displayEmail}</span>
                                    </a>
                                )}
                                {parsedResume.phone && (
                                    <span className="flex items-center gap-2 text-muted-foreground md:flex-row-reverse">
                                        <Phone className="w-4 h-4" />
                                        <span>{parsedResume.phone}</span>
                                    </span>
                                )}
                                {parsedResume.linkedin && (
                                    <span className="flex items-center gap-2 text-muted-foreground md:flex-row-reverse">
                                        <Globe className="w-4 h-4" />
                                        <span className="truncate max-w-[200px]">{parsedResume.linkedin}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Skills Section - Prominent at top */}
                    {Array.isArray(meta.skills) && meta.skills.length > 0 && (
                        <div className="px-8 py-6 bg-slate-50 border-b border-border print:bg-slate-50">
                            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Code className="w-4 h-4 text-primary" />
                                Core Skills & Technologies
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                {(meta.skills as string[]).map((skill: string, idx: number) => (
                                    <span
                                        key={idx}
                                        className="px-3 py-1.5 bg-white border border-border rounded-full text-sm font-medium text-foreground shadow-sm print:border-slate-300"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Recruiter Quick Reference Card - Hide in print */}
                <div className="mt-6 bg-white shadow-lg rounded-xl p-6 print:hidden">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        Quick Reference for Recruiters
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Experience</p>
                            <p className="text-lg font-semibold text-foreground">
                                {meta.experience_years ? `${meta.experience_years}+ years` : 'N/A'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Education</p>
                            <p className="text-lg font-semibold text-foreground">
                                {meta.education_level ? String(meta.education_level) : 'N/A'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Location</p>
                            <p className="text-lg font-semibold text-foreground truncate">
                                {displayLocation || 'N/A'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Remote</p>
                            <p className="text-lg font-semibold text-foreground">
                                {meta.is_remote ? 'Yes' : 'No'}
                            </p>
                        </div>
                    </div>

                    {/* Skills summary */}
                    {Array.isArray(meta.skills) && meta.skills.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Top Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(meta.skills as string[]).slice(0, 10).map((skill: string, idx: number) => (
                                    <span
                                        key={idx}
                                        className="px-2 py-1 bg-primary/10 rounded text-xs font-medium text-primary"
                                    >
                                        {skill}
                                    </span>
                                ))}
                                {(meta.skills as string[]).length > 10 && (
                                    <span className="px-2 py-1 text-xs text-muted-foreground">
                                        +{(meta.skills as string[]).length - 10} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Raw Chunks Dropdown - Collapsible */}
                <RawChunksSection chunks={chunks} metadata={metadata} />
            </div>
        </div>
    );
}
