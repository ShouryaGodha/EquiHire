/**
 * Local storage service for chat history.
 * All data is stored in the browser's localStorage.
 */

import { ChatSession, ChatMessage } from '../types/chatHistory';
import { SearchResponse } from '../types';

const STORAGE_KEY = 'recruitment_chat_history';

/**
 * Generate a unique ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a title from the job description
 */
export function generateTitle(jobDescription: string): string {
    // Take first 50 chars and clean up
    const cleaned = jobDescription
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleaned.length <= 50) {
        return cleaned;
    }

    // Find a good break point (end of word)
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 30) {
        return truncated.substring(0, lastSpace) + '…';
    }

    return truncated + '…';
}

/**
 * Get all chat sessions from localStorage
 */
export function getAllSessions(): ChatSession[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];

        const sessions: ChatSession[] = JSON.parse(data);

        // De-duplicate sessions by ID (keep the first occurrence)
        const uniqueSessions = sessions.reduce((acc: ChatSession[], session) => {
            if (!acc.find(s => s.id === session.id)) {
                acc.push(session);
            }
            return acc;
        }, []);

        // Sort by updatedAt descending (most recent first)
        return uniqueSessions.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    } catch (error) {
        console.error('Error reading chat history:', error);
        return [];
    }
}

/**
 * Get a single session by ID
 */
export function getSession(sessionId: string): ChatSession | null {
    const sessions = getAllSessions();
    return sessions.find(s => s.id === sessionId) || null;
}

/**
 * Save all sessions to localStorage
 */
function saveSessions(sessions: ChatSession[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
        console.error('Error saving chat history:', error);
        // If storage is full, try removing old sessions
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            const trimmedSessions = sessions.slice(0, Math.floor(sessions.length / 2));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSessions));
        }
    }
}

/**
 * Create a new chat session
 */
export function createSession(jobDescription: string): ChatSession {
    const now = new Date().toISOString();
    const sessions = getAllSessions();

    // Check if a recent session with the same job description exists (within 5 minutes)
    // This prevents duplicate session creation from React strict mode, double renders,
    // or navigating away and back to the same page
    const recentDuplicate = sessions.find(s => {
        const timeDiff = new Date(now).getTime() - new Date(s.createdAt).getTime();
        // 5 minutes = 300000ms - covers most navigation scenarios
        return s.jobDescription === jobDescription && timeDiff < 300000;
    });

    if (recentDuplicate) {
        return recentDuplicate;
    }

    const session: ChatSession = {
        id: generateId(),
        title: generateTitle(jobDescription),
        jobDescription,
        messages: [],
        createdAt: now,
        updatedAt: now,
    };

    sessions.unshift(session); // Add to beginning
    saveSessions(sessions);

    return session;
}

/**
 * Add a message to a session
 */
export function addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    messageType: 'initial_search' | 'followup',
    searchResponse?: SearchResponse
): ChatMessage | null {
    const sessions = getAllSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) return null;

    const message: ChatMessage = {
        id: generateId(),
        role,
        content,
        searchResponse,
        timestamp: new Date().toISOString(),
        messageType,
    };

    sessions[sessionIndex].messages.push(message);
    sessions[sessionIndex].updatedAt = new Date().toISOString();

    // Update candidate count if we have search results
    if (searchResponse) {
        sessions[sessionIndex].candidateCount = searchResponse.matches.length;
    }

    saveSessions(sessions);

    return message;
}

/**
 * Update session title
 */
export function updateSessionTitle(sessionId: string, title: string): boolean {
    const sessions = getAllSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) return false;

    sessions[sessionIndex].title = title;
    sessions[sessionIndex].updatedAt = new Date().toISOString();
    saveSessions(sessions);

    return true;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
    const sessions = getAllSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);

    if (filteredSessions.length === sessions.length) return false;

    saveSessions(filteredSessions);
    return true;
}

/**
 * Clear all chat history
 */
export function clearAllHistory(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get recent sessions (for display on home page)
 */
export function getRecentSessions(limit: number = 5): ChatSession[] {
    return getAllSessions().slice(0, limit);
}

/**
 * Search sessions by title or job description
 */
export function searchSessions(query: string): ChatSession[] {
    const lowerQuery = query.toLowerCase();
    return getAllSessions().filter(session =>
        session.title.toLowerCase().includes(lowerQuery) ||
        session.jobDescription.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Export chat history service
 */
export const chatHistoryService = {
    generateId,
    generateTitle,
    getAllSessions,
    getSession,
    createSession,
    addMessage,
    updateSessionTitle,
    deleteSession,
    clearAllHistory,
    getRecentSessions,
    searchSessions,
};

export default chatHistoryService;
