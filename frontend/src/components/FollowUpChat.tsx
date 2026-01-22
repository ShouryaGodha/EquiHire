import { useState, FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';

interface FollowUpChatProps {
    sessionId: string;
    onFollowUp: (question: string) => void;
    isLoading: boolean;
    history: Array<{ question: string; timestamp: Date }>;
}

export default function FollowUpChat({
    onFollowUp,
    isLoading,
    history,
}: FollowUpChatProps) {
    const [question, setQuestion] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (question.trim()) {
            onFollowUp(question.trim());
            setQuestion('');
        }
    };

    const suggestions = [
        'Show me candidates with more AWS experience',
        'Filter for remote-friendly candidates',
        'Prioritize candidates from FAANG companies',
        'I need someone with team leadership experience',
    ];

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center space-x-2">
                <MessageCircle className="w-5 h-5 text-primary-600" />
                <h3 className="font-medium text-gray-900">Refine Search</h3>
            </div>

            <div className="p-4">
                {/* History */}
                {history.length > 0 && (
                    <div className="mb-4 space-y-2">
                        {history.map((item, idx) => (
                            <div
                                key={idx}
                                className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg"
                            >
                                <span className="text-gray-400 text-xs">
                                    {item.timestamp.toLocaleTimeString()}
                                </span>
                                <p>{item.question}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex space-x-2">
                    <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ask a follow-up question..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!question.trim() || isLoading}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>

                {/* Suggestions */}
                <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">Quick refinements:</p>
                    <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => setQuestion(suggestion)}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
