/**
 * Types for local chat history storage.
 */

import { SearchResponse } from '../types';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    searchResponse?: SearchResponse;
    timestamp: string;
    messageType: 'initial_search' | 'followup';
}

export interface ChatSession {
    id: string;
    title: string;
    jobDescription: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
    candidateCount?: number;
}

export interface ChatHistoryState {
    sessions: ChatSession[];
    currentSessionId: string | null;
}
