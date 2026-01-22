import { useState, FormEvent } from 'react';
import { Search, Sparkles } from 'lucide-react';

interface SearchInputProps {
    onSearch: (query: string) => void;
    isLoading: boolean;
    placeholder?: string;
}

export default function SearchInput({
    onSearch,
    isLoading,
    placeholder = 'Describe the ideal candidate...',
}: SearchInputProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const exampleQueries = [
        'Senior Python backend engineer with distributed systems experience',
        'Full stack developer with React, Node.js, and TypeScript',
        'ML engineer with NLP and LLM experience, 4+ years',
        'DevOps/SRE with Kubernetes and Terraform expertise',
        'iOS developer with SwiftUI and 5+ years experience',
        'Data scientist with Python, SQL, and A/B testing background',
        'Security engineer with penetration testing skills',
        'Blockchain developer with Solidity and DeFi experience',
    ];

    return (
        <div className="w-full">
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={placeholder}
                        rows={3}
                        className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                        disabled={isLoading}
                    />
                </div>
                <div className="flex justify-between items-center mt-3">
                    <p className="text-sm text-gray-500">
                        <Sparkles className="w-4 h-4 inline mr-1" />
                        AI will extract skills, experience, and role requirements automatically
                    </p>
                    <button
                        type="submit"
                        disabled={!query.trim() || isLoading}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {isLoading ? 'Searching...' : 'Search Candidates'}
                    </button>
                </div>
            </form>

            {/* Example queries */}
            <div className="mt-6">
                <p className="text-sm text-gray-500 mb-2">Try an example:</p>
                <div className="flex flex-wrap gap-2">
                    {exampleQueries.map((example, idx) => (
                        <button
                            key={idx}
                            onClick={() => setQuery(example)}
                            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition"
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
