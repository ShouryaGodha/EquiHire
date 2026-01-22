import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JobDescriptionInput } from '../components/JobDescriptionInput';
import { MessageSquare, Clock, ChevronRight, Trash2 } from 'lucide-react';
import { chatHistoryService } from '../services/chatHistoryService';
import { ChatSession } from '../types/chatHistory';

const Index = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [recentSessions, setRecentSessions] = useState<ChatSession[]>(
        () => chatHistoryService.getRecentSessions(5)
    );

    const handleSubmit = (description: string) => {
        setIsLoading(true);

        // Navigate to candidates page with the job description
        setTimeout(() => {
            navigate('/candidates', { state: { jobDescription: description } });
        }, 800);
    };

    const handleResumeSession = (session: ChatSession) => {
        navigate(`/candidates?session=${session.id}`);
    };

    const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (confirm('Delete this chat?')) {
            chatHistoryService.deleteSession(sessionId);
            setRecentSessions(chatHistoryService.getRecentSessions(5));
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="min-h-screen bg-background">
            <JobDescriptionInput
                onSubmit={handleSubmit}
                isLoading={isLoading}
            />

            {/* Recent Chats Section */}
            {recentSessions.length > 0 && (
                <div className="max-w-4xl mx-auto px-6 pb-12 -mt-8">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-gray-500" />
                                <h2 className="font-semibold text-gray-900">Recent Searches</h2>
                            </div>
                            <button
                                onClick={() => navigate('/candidates')}
                                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                            >
                                View all
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {recentSessions.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => handleResumeSession(session)}
                                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                                        <MessageSquare className="w-5 h-5 text-primary-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 truncate">
                                            {session.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-sm text-gray-500">
                                                {formatDate(session.updatedAt)}
                                            </span>
                                            {session.candidateCount !== undefined && (
                                                <>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="text-sm text-gray-500">
                                                        {session.candidateCount} candidates
                                                    </span>
                                                </>
                                            )}
                                            {session.messages.length > 0 && (
                                                <>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="text-sm text-gray-500">
                                                        {session.messages.length} messages
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => handleDeleteSession(e, session.id)}
                                            className="p-2 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Index;
