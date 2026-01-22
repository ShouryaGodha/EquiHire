import { CandidateMatch } from '../types';

interface CandidateCardProps {
    candidate: CandidateMatch;
    isSelected?: boolean;
    onClick?: () => void;
}

function getScoreClass(score: number): string {
    if (score >= 0.85) return 'score-badge-high';
    if (score >= 0.70) return 'score-badge-medium';
    return 'score-badge-low';
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

export function CandidateCard({ candidate, isSelected, onClick }: CandidateCardProps) {
    const { score, extracted_metadata: metadata } = candidate;
    const displayName = extractNameFromEvidence(candidate) || `Candidate #${candidate.rank}`;
    const matchPercent = Math.round(score.total_score * 100);

    // Create headline from role and experience
    const headline = [
        metadata.role_category?.replace('_', ' '),
        metadata.experience_years ? `${metadata.experience_years} years exp.` : null,
        metadata.location
    ].filter(Boolean).join(' • ');

    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-4 rounded-lg border transition-subtle ${isSelected
                ? 'border-primary/30 bg-accent'
                : 'border-transparent hover:bg-accent/50'
                }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            #{candidate.rank}
                        </span>
                        <h3 className="font-medium text-foreground truncate">
                            {displayName}
                        </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {headline || 'No details available'}
                    </p>
                </div>
                <span className={`score-badge ${getScoreClass(score.total_score)}`}>
                    {matchPercent}%
                </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
                {metadata.skills.slice(0, 3).map((skill) => (
                    <span
                        key={skill}
                        className={`skill-tag ${score.matched_skills.includes(skill)
                            ? 'bg-emerald-50 text-emerald-700'
                            : ''
                            }`}
                    >
                        {skill}
                    </span>
                ))}
                {metadata.skills.length > 3 && (
                    <span className="skill-tag">+{metadata.skills.length - 3}</span>
                )}
            </div>
        </button>
    );
}

// Also export as default for backward compatibility
export default CandidateCard;

