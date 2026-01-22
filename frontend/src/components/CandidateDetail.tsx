import { CandidateMatch } from '../types';
import { MapPin, Briefcase, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CandidateDetailProps {
    candidate: CandidateMatch;
    explanation?: string;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
    const percentage = Math.round(value * 100);
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground">{percentage}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

/**
 * Extract candidate name from evidence text when not provided by backend.
 * Looks for a name pattern at the start of evidence (typically Name + email format).
 */
function extractNameFromEvidence(candidate: CandidateMatch): string | null {
    if (candidate.candidate_name) return candidate.candidate_name;

    // Common section headers to skip (all caps or title case)
    const sectionHeaders = new Set([
        'EXPERIENCE', 'EDUCATION', 'SKILLS', 'ABOUT', 'SUMMARY', 'PROJECTS',
        'CERTIFICATIONS', 'AWARDS', 'PUBLICATIONS', 'LANGUAGES', 'INTERESTS',
        'OBJECTIVE', 'PROFILE', 'WORK', 'EMPLOYMENT', 'CONTACT', 'REFERENCES'
    ]);

    // Common non-name words that appear in resumes (education fields, titles, etc.)
    const excludedWords = new Set([
        // Education fields
        'computer', 'science', 'engineering', 'financial', 'business', 'mathematics',
        'physics', 'chemistry', 'biology', 'economics', 'statistics', 'data',
        'information', 'technology', 'systems', 'electrical', 'mechanical',
        'software', 'hardware', 'network', 'security', 'artificial', 'intelligence',
        'machine', 'learning', 'deep', 'analytics', 'management', 'administration',
        // Degrees
        'bachelor', 'master', 'doctor', 'phd', 'mba', 'bsc', 'msc', 'ba', 'ma', 'bs', 'ms',
        // Job titles
        'senior', 'junior', 'staff', 'lead', 'principal', 'manager', 'director',
        'engineer', 'developer', 'analyst', 'scientist', 'architect', 'consultant',
        'specialist', 'coordinator', 'administrator', 'associate', 'intern', 'trainee',
        // Companies/Orgs
        'amazon', 'google', 'microsoft', 'apple', 'meta', 'facebook', 'netflix',
        'university', 'college', 'institute', 'corporation', 'company', 'inc', 'llc',
        // Other common words
        'remote', 'hybrid', 'onsite', 'full', 'time', 'part', 'contract', 'present',
        'current', 'previous', 'former', 'team', 'group', 'department', 'division'
    ]);

    // Check if a word looks like a proper name (Title Case, not all caps)
    const isProperName = (word: string): boolean => {
        if (!word || word.length < 2) return false;
        // Reject all-caps words (likely section headers)
        if (word === word.toUpperCase()) return false;
        // Reject if it's a known section header
        if (sectionHeaders.has(word.toUpperCase())) return false;
        // Reject common non-name words
        if (excludedWords.has(word.toLowerCase())) return false;
        // Must start with uppercase and have lowercase letters
        return /^[A-Z][a-z]+$/.test(word);
    };

    // Try to extract name from evidence chunks
    for (const ev of candidate.evidence) {
        const text = ev.chunk_text;

        // Skip if chunk starts with a section header
        const firstWord = text.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '');
        if (firstWord && sectionHeaders.has(firstWord.toUpperCase())) {
            continue;
        }

        // Pattern 1: Look for "FirstName LastName email@..." at start (handles no-newline case)
        const nameEmailMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+[a-zA-Z0-9._%+-]+@/i);
        if (nameEmailMatch) {
            const possibleName = nameEmailMatch[1].trim();
            const nameWords = possibleName.split(/\s+/);
            if (nameWords.every(w => isProperName(w) || /^[A-Z][a-z]+$/.test(w))) {
                return possibleName;
            }
        }

        // Pattern 2: Name on first line if there are newlines (2-4 capitalized words)
        const lines = text.split('\n');
        const firstLine = lines[0]?.trim();
        if (firstLine && firstLine.length < 40 && !sectionHeaders.has(firstLine.toUpperCase())) {
            const nameMatch = firstLine.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/);
            if (nameMatch) {
                const nameWords = nameMatch[1].split(/\s+/);
                if (nameWords.every(w => isProperName(w))) {
                    return nameMatch[1];
                }
            }
        }

        // Pattern 3: Extract proper name words at start (Title Case only, not ALL CAPS)
        const words = text.split(/\s+/);
        const nameWords: string[] = [];
        for (const word of words.slice(0, 5)) {
            if (word.includes('@') || (word && /^[a-z]/.test(word))) break;
            if (isProperName(word)) {
                nameWords.push(word);
            } else if (nameWords.length > 0) {
                // Stop if we hit a non-name word after collecting some names
                break;
            }
        }
        if (nameWords.length >= 2 && nameWords.length <= 4) {
            return nameWords.join(' ');
        }
    }
    return null;
}

export function CandidateDetail({ candidate, explanation }: CandidateDetailProps) {
    const { score, extracted_metadata: metadata, evidence: _evidence, filters_matched, filters_missed } = candidate;
    const displayName = extractNameFromEvidence(candidate) || `Candidate #${candidate.rank}`;
    const matchPercent = Math.round(score.total_score * 100);

    const headline = [
        metadata.role_category?.replace('_', ' '),
        metadata.experience_years ? `${metadata.experience_years} years experience` : null,
    ].filter(Boolean).join(' • ');

    return (
        <div className="h-full overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-border">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">
                                Rank #{candidate.rank}
                            </span>
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mt-1">
                            {displayName}
                        </h2>
                        <p className="text-muted-foreground mt-1">
                            {headline || 'Candidate Profile'}
                        </p>
                    </div>
                    <span className={`score-badge ${matchPercent >= 85 ? 'score-badge-high' :
                        matchPercent >= 70 ? 'score-badge-medium' : 'score-badge-low'
                        } text-sm px-3 py-1`}>
                        {matchPercent}% match
                    </span>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                    {metadata.location && (
                        <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            {metadata.location}
                        </span>
                    )}
                    {metadata.experience_years && (
                        <span className="flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4" />
                            {metadata.experience_years} years
                        </span>
                    )}
                    {metadata.is_remote && (
                        <span className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle className="w-4 h-4" />
                            Open to remote
                        </span>
                    )}
                </div>

                {/* View full profile link */}
                <Link
                    to={`/candidate/${candidate.candidate_id}`}
                    className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline"
                >
                    View full profile
                    <ExternalLink className="w-3.5 h-3.5" />
                </Link>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
                {/* Why this candidate matches */}
                <section>
                    <h3 className="text-sm font-medium text-foreground mb-3">
                        Why this candidate matches
                    </h3>
                    <p className="text-muted-foreground leading-relaxed mb-3">
                        {score.score_explanation || 'Based on overall profile relevance to your job description.'}
                    </p>

                    {/* Filters matched/missed */}
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        {filters_matched.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-emerald-700 mb-2 flex items-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Criteria Met
                                </h4>
                                <ul className="space-y-1">
                                    {filters_matched.map((filter, index) => (
                                        <li
                                            key={index}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
                                            <span>{filter}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {filters_missed.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Not Matched (soft)
                                </h4>
                                <ul className="space-y-1">
                                    {filters_missed.map((filter, index) => (
                                        <li
                                            key={index}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                                            <span>{filter}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>

                {/* Score breakdown */}
                <section>
                    <h3 className="text-sm font-medium text-foreground mb-4">
                        Score breakdown
                    </h3>
                    <div className="space-y-4">
                        <ScoreBar label="Semantic match" value={score.semantic_similarity} />
                        <ScoreBar label="Skills match" value={score.skills_match} />
                        <ScoreBar label="Experience fit" value={score.experience_fit} />
                        <ScoreBar label="Role match" value={score.role_match} />
                        <ScoreBar label="Availability" value={score.availability_score} />
                    </div>
                </section>

                {/* Skills */}
                <section>
                    <h3 className="text-sm font-medium text-foreground mb-3">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                        {metadata.skills.map((skill) => (
                            <span
                                key={skill}
                                className={`skill-tag ${score.matched_skills.includes(skill)
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : ''
                                    }`}
                            >
                                {skill}
                            </span>
                        ))}
                    </div>
                    {score.missing_skills.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs text-muted-foreground mb-1.5">Missing skills (soft filter):</p>
                            <div className="flex flex-wrap gap-1.5">
                                {score.missing_skills.map((skill) => (
                                    <span key={skill} className="skill-tag bg-amber-50 text-amber-700">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {/* Global explanation */}
                {explanation && (
                    <section className="pt-4 border-t border-border">
                        <h3 className="text-sm font-medium text-foreground mb-2">
                            Search explanation
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {explanation}
                        </p>
                    </section>
                )}
            </div>
        </div>
    );
}
