/**
 * Sidebar component for displaying chat history.
 */

import { useState } from 'react';
import {
    MessageSquare,
    Trash2,
    Edit2,
    Check,
    X,
    Search,
    ChevronLeft,
    ChevronRight,
    Plus,
    Clock
} from 'lucide-react';
import { ChatSession } from '../types/chatHistory';

interface ChatHistorySidebarProps {
    sessions: ChatSession[];
    currentSessionId: string | null;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onSelectSession: (session: ChatSession) => void;
    onDeleteSession: (sessionId: string) => void;
    onRenameSession: (sessionId: string, title: string) => void;
    onNewChat: () => void;
}

export function ChatHistorySidebar({
    sessions,
    currentSessionId,
    isCollapsed,
    onToggleCollapse,
    onSelectSession,
    onDeleteSession,
    onRenameSession,
    onNewChat,
}: ChatHistorySidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    // Filter sessions based on search
    const filteredSessions = searchQuery
        ? sessions.filter(s =>
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.jobDescription.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : sessions;

    // Group sessions by date
    const groupedSessions = groupSessionsByDate(filteredSessions);

    const handleStartEdit = (session: ChatSession) => {
        setEditingId(session.id);
        setEditTitle(session.title);
    };

    const handleSaveEdit = (sessionId: string) => {
        if (editTitle.trim()) {
            onRenameSession(sessionId, editTitle.trim());
        }
        setEditingId(null);
        setEditTitle('');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditTitle('');
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (isCollapsed) {
        return (
            <div className="w-12 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-4">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Expand sidebar"
                >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
            </div>
        );
    }

    return (
        <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-900">Chat History</h2>
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Collapse sidebar"
                    >
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors mb-3"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Search</span>
                </button>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search history..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto">
                {filteredSessions.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                        {searchQuery ? 'No matching chats found' : 'No chat history yet'}
                    </div>
                ) : (
                    Object.entries(groupedSessions).map(([group, groupSessions]) => (
                        <div key={group}>
                            <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-100">
                                {group}
                            </div>
                            {groupSessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={`group relative ${currentSessionId === session.id
                                        ? 'bg-primary-50 border-l-2 border-primary-600'
                                        : 'hover:bg-gray-100 border-l-2 border-transparent'
                                        }`}
                                >
                                    {editingId === session.id ? (
                                        <div className="p-3">
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit(session.id);
                                                    if (e.key === 'Escape') handleCancelEdit();
                                                }}
                                            />
                                            <div className="flex gap-1 mt-2">
                                                <button
                                                    onClick={() => handleSaveEdit(session.id)}
                                                    className="p-1 hover:bg-green-100 rounded text-green-600"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="p-1 hover:bg-red-100 rounded text-red-600"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => onSelectSession(session)}
                                            className="w-full text-left p-3"
                                        >
                                            <div className="flex items-start gap-2">
                                                <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${currentSessionId === session.id
                                                    ? 'text-primary-600'
                                                    : 'text-gray-400'
                                                    }`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium truncate ${currentSessionId === session.id
                                                        ? 'text-primary-900'
                                                        : 'text-gray-900'
                                                        }`}>
                                                        {session.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Clock className="w-3 h-3 text-gray-400" />
                                                        <span className="text-xs text-gray-500">
                                                            {formatTime(session.updatedAt)}
                                                        </span>
                                                        {session.candidateCount !== undefined && (
                                                            <span className="text-xs text-gray-500">
                                                                • {session.candidateCount} candidates
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    )}

                                    {/* Action buttons - show on hover */}
                                    {editingId !== session.id && (
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStartEdit(session);
                                                }}
                                                className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
                                                title="Rename"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Delete this chat?')) {
                                                        onDeleteSession(session.id);
                                                    }
                                                }}
                                                className="p-1.5 hover:bg-red-100 rounded text-gray-500 hover:text-red-600"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Group sessions by date (Today, Yesterday, This Week, Older)
 */
function groupSessionsByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
    const groups: Record<string, ChatSession[]> = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    sessions.forEach(session => {
        const sessionDate = new Date(session.updatedAt);
        const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

        let group: string;
        if (sessionDay.getTime() >= today.getTime()) {
            group = 'Today';
        } else if (sessionDay.getTime() >= yesterday.getTime()) {
            group = 'Yesterday';
        } else if (sessionDay.getTime() >= weekAgo.getTime()) {
            group = 'This Week';
        } else {
            group = 'Older';
        }

        if (!groups[group]) {
            groups[group] = [];
        }
        groups[group].push(session);
    });

    return groups;
}

export default ChatHistorySidebar;
