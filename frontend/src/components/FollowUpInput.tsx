import { useState } from 'react';
import { Send, ChevronDown } from 'lucide-react';

interface FollowUpInputProps {
    onSubmit: (query: string) => void;
    isLoading?: boolean;
}

export function FollowUpInput({ onSubmit, isLoading }: FollowUpInputProps) {
    const [query, setQuery] = useState('');
    const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim() && !isLoading) {
            onSubmit(query);
            setQuery('');
        }
    };

    // Quick filter suggestions (always visible)
    const quickSuggestions = [
        'Only show AWS experience',
        'Filter for 5+ years',
        'Remote candidates only',
        'Python required',
    ];

    // Extended categorized suggestions
    const suggestionCategories = [
        {
            title: 'Experience Level',
            suggestions: [
                'Show only senior candidates (6+ years)',
                'Junior candidates with potential',
                'Staff/Principal level engineers only',
                'Filter for 3-5 years experience',
                'Entry level or bootcamp graduates',
            ]
        },
        {
            title: 'Technical Skills',
            suggestions: [
                'Must have Kubernetes experience',
                'Add TypeScript as a requirement',
                'Filter for candidates with ML/AI skills',
                'Show only candidates with cloud certifications',
                'Require distributed systems experience',
                'Must know React and Node.js',
                'Filter for database expertise (PostgreSQL/MongoDB)',
                'Show candidates with Go or Rust experience',
            ]
        },
        {
            title: 'Domain Expertise',
            suggestions: [
                'Prefer fintech or trading background',
                'Healthcare/HIPAA experience required',
                'E-commerce or marketplace experience',
                'Show candidates from FAANG companies',
                'Startup experience preferred',
                'Gaming or entertainment industry',
                'Automotive or robotics background',
            ]
        },
        {
            title: 'Location & Availability',
            suggestions: [
                'Only remote candidates',
                'Based in US timezone',
                'Open to relocation',
                'Hybrid work preference',
                'International candidates welcome',
            ]
        },
        {
            title: 'Education & Credentials',
            suggestions: [
                'PhD holders only',
                'MS or PhD in Computer Science',
                'Security certifications (CISSP, OSCP)',
                'AWS certified candidates',
                'Bootcamp graduates welcome',
            ]
        },
        {
            title: 'Soft Skills & Leadership',
            suggestions: [
                'Prior team lead experience',
                'Mentorship or teaching experience',
                'Open source contributors',
                'Strong communication skills noted',
                'Cross-functional collaboration experience',
            ]
        },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <form onSubmit={handleSubmit} className="space-y-3 max-w-7xl mx-auto">
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Refine results (e.g., 'Only show candidates with AWS and Kubernetes experience')"
                        className="input-field flex-1"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || isLoading}
                        className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>

                {/* Quick suggestions - always visible */}
                <div className="flex flex-wrap items-center gap-2">
                    {quickSuggestions.map((suggestion) => (
                        <button
                            key={suggestion}
                            type="button"
                            onClick={() => setQuery(suggestion)}
                            className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
                        >
                            {suggestion}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setShowMoreSuggestions(!showMoreSuggestions)}
                        className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-1"
                    >
                        {showMoreSuggestions ? 'Less' : 'More filters'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${showMoreSuggestions ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {/* Extended suggestions panel */}
                {showMoreSuggestions && (
                    <div className="border border-border rounded-lg p-3 bg-card max-h-64 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {suggestionCategories.map((category) => (
                                <div key={category.title}>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                        {category.title}
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {category.suggestions.map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                onClick={() => {
                                                    setQuery(suggestion);
                                                    setShowMoreSuggestions(false);
                                                }}
                                                className="text-xs px-2 py-1 rounded bg-secondary/50 text-secondary-foreground hover:bg-secondary transition-all text-left"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </form>
        </div>
    );
}
