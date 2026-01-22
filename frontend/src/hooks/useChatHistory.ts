/**
 * React hook for managing chat history state.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChatSession } from '../types/chatHistory';
import { SearchResponse } from '../types';
import chatHistoryService from '../services/chatHistoryService';

interface UseChatHistoryReturn {
    sessions: ChatSession[];
    currentSession: ChatSession | null;
    isLoading: boolean;

    // Session operations
    createSession: (jobDescription: string) => ChatSession;
    loadSession: (sessionId: string) => ChatSession | null;
    deleteSession: (sessionId: string) => void;
    renameSession: (sessionId: string, title: string) => void;
    clearHistory: () => void;

    // Message operations
    addUserMessage: (content: string, messageType: 'initial_search' | 'followup') => void;
    addAssistantMessage: (content: string, messageType: 'initial_search' | 'followup', searchResponse?: SearchResponse) => void;

    // Current session management
    setCurrentSessionId: (sessionId: string | null) => void;

    // Search
    searchSessions: (query: string) => ChatSession[];

    // Refresh
    refreshSessions: () => void;
}

export function useChatHistory(initialSessionId?: string): UseChatHistoryReturn {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null);
    const [isLoading, setIsLoading] = useState(true);

    // Load sessions on mount
    useEffect(() => {
        refreshSessions();
        setIsLoading(false);
    }, []);

    // Get current session
    const currentSession = currentSessionId
        ? sessions.find(s => s.id === currentSessionId) || null
        : null;

    // Refresh sessions from localStorage
    const refreshSessions = useCallback(() => {
        const allSessions = chatHistoryService.getAllSessions();
        setSessions(allSessions);
    }, []);

    // Create a new session
    const createSession = useCallback((jobDescription: string): ChatSession => {
        const session = chatHistoryService.createSession(jobDescription);
        refreshSessions();
        setCurrentSessionId(session.id);
        return session;
    }, [refreshSessions]);

    // Load a session by ID
    const loadSession = useCallback((sessionId: string): ChatSession | null => {
        const session = chatHistoryService.getSession(sessionId);
        if (session) {
            setCurrentSessionId(sessionId);
            refreshSessions();
        }
        return session;
    }, [refreshSessions]);

    // Delete a session
    const deleteSession = useCallback((sessionId: string) => {
        chatHistoryService.deleteSession(sessionId);
        if (currentSessionId === sessionId) {
            setCurrentSessionId(null);
        }
        refreshSessions();
    }, [currentSessionId, refreshSessions]);

    // Rename a session
    const renameSession = useCallback((sessionId: string, title: string) => {
        chatHistoryService.updateSessionTitle(sessionId, title);
        refreshSessions();
    }, [refreshSessions]);

    // Clear all history
    const clearHistory = useCallback(() => {
        chatHistoryService.clearAllHistory();
        setCurrentSessionId(null);
        setSessions([]);
    }, []);

    // Add a user message
    const addUserMessage = useCallback((
        content: string,
        messageType: 'initial_search' | 'followup'
    ) => {
        if (!currentSessionId) return;
        chatHistoryService.addMessage(currentSessionId, 'user', content, messageType);
        refreshSessions();
    }, [currentSessionId, refreshSessions]);

    // Add an assistant message (with search response)
    const addAssistantMessage = useCallback((
        content: string,
        messageType: 'initial_search' | 'followup',
        searchResponse?: SearchResponse
    ) => {
        if (!currentSessionId) return;
        chatHistoryService.addMessage(currentSessionId, 'assistant', content, messageType, searchResponse);
        refreshSessions();
    }, [currentSessionId, refreshSessions]);

    // Search sessions
    const searchSessionsFn = useCallback((query: string): ChatSession[] => {
        return chatHistoryService.searchSessions(query);
    }, []);

    return {
        sessions,
        currentSession,
        isLoading,
        createSession,
        loadSession,
        deleteSession,
        renameSession,
        clearHistory,
        addUserMessage,
        addAssistantMessage,
        setCurrentSessionId,
        searchSessions: searchSessionsFn,
        refreshSessions,
    };
}

export default useChatHistory;
