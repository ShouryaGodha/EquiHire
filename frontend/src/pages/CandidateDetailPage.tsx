import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    User,
    MapPin,
    Briefcase,
    GraduationCap,
    Code,
    Loader2,
    AlertCircle,
    CheckCircle,
} from 'lucide-react';
import { recruitmentApi } from '../api';

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
                <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
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
                <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
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

    // Extract candidate name from chunks when not available
    const extractNameFromChunks = (): string | null => {
        for (const chunk of chunks) {
            const text = typeof chunk.text === 'string' ? chunk.text : '';
            // Pattern: Look for "FirstName LastName email@..." at start
            const nameEmailMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+[a-zA-Z0-9._%+-]+@/i);
            if (nameEmailMatch) {
                return nameEmailMatch[1].trim();
            }
            // Pattern: Name on first line (2-4 capitalized words)
            const lines = text.split('\n');
            const firstLine = lines[0]?.trim();
            if (firstLine && firstLine.length < 40) {
                const nameMatch = firstLine.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/);
                if (nameMatch) return nameMatch[1];
            }
        }
        return null;
    };

    const displayName = extractNameFromChunks() || `Candidate ${id?.slice(0, 8)}`;

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </button>
                <div>
                    <h1 className="text-lg font-semibold text-foreground">
                        {displayName}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {id?.slice(0, 8)}...
                    </p>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
                {/* Profile Card */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="bg-primary/5 px-6 py-6 border-b border-border">
                        <div className="flex items-center space-x-4">
                            <div className="bg-primary/10 p-4 rounded-full">
                                <User className="w-8 h-8 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">
                                    {displayName}
                                </h2>
                                <p className="text-muted-foreground">
                                    {typeof meta.role_category === 'string' ? meta.role_category.replace('_', ' ') : 'Role not specified'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Info */}
                    <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border">
                        {!!meta.experience_years && (
                            <div className="flex items-center space-x-2">
                                <Briefcase className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {String(meta.experience_years)}+ years
                                </span>
                            </div>
                        )}
                        {!!meta.location && (
                            <div className="flex items-center space-x-2">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{String(meta.location)}</span>
                            </div>
                        )}
                        {!!meta.education_level && (
                            <div className="flex items-center space-x-2">
                                <GraduationCap className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{String(meta.education_level)}</span>
                            </div>
                        )}
                        {!!meta.is_remote && (
                            <div className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm text-emerald-600">Remote Friendly</span>
                            </div>
                        )}
                    </div>

                    {/* Skills */}
                    {Array.isArray(meta.skills) && meta.skills.length > 0 && (
                        <div className="px-6 py-4">
                            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center">
                                <Code className="w-4 h-4 mr-2" />
                                Skills
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {(meta.skills as string[]).map((skill: string, idx: number) => (
                                    <span
                                        key={idx}
                                        className="skill-tag"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Resume Chunks */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground">Resume Sections</h2>

                    {chunks.map((chunk: Record<string, unknown>, idx: number) => (
                        <div
                            key={idx}
                            className="bg-card border border-border rounded-xl p-6"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                                    {typeof chunk.chunk_type === 'string' ? chunk.chunk_type.replace('_', ' ') : 'Section'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Chunk #{typeof chunk.chunk_index === 'number' ? chunk.chunk_index + 1 : idx + 1}
                                </span>
                            </div>
                            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {typeof chunk.text === 'string' ? chunk.text : ''}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Metadata Transparency */}
                <div className="bg-secondary/50 border border-border rounded-xl p-6">
                    <h3 className="text-sm font-medium text-foreground mb-3">
                        Extraction Metadata
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        This metadata was automatically extracted from the resume text. It may
                        be incomplete or approximate.
                    </p>
                    <pre className="text-xs text-muted-foreground bg-background p-4 rounded-lg overflow-auto border border-border">
                        {JSON.stringify(metadata, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
}
