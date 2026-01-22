import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Settings, Loader2 } from 'lucide-react';
import { CandidateList } from '../components/CandidateList';
import { CandidateDetail } from '../components/CandidateDetail';
import { FollowUpInput } from '../components/FollowUpInput';
import { ChatHistorySidebar } from '../components/ChatHistorySidebar';
import { searchCandidates, submitFollowUp } from '../api';
import { CandidateMatch, SearchResponse } from '../types';
import { useChatHistory } from '../hooks/useChatHistory';
import { ChatSession } from '../types/chatHistory';
import chatHistoryService from '../services/chatHistoryService';

export default function CandidatesPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const jobDescription = location.state?.jobDescription || '';
    const resumeSessionId = searchParams.get('session');

    const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
    const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefining, setIsRefining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [localSessionId, setLocalSessionId] = useState<string | null>(resumeSessionId);

    // Chat history
    const {
        sessions,
        currentSession,
        createSession,
        loadSession,
        deleteSession,
        renameSession,
        addUserMessage,
        addAssistantMessage,
        setCurrentSessionId,
    } = useChatHistory();

    // Track initialization with a ref to persist across re-renders and avoid race conditions
    // Use a combination of ref and state to track which session/job description we've initialized
    const initializedForRef = useRef<string | null>(null);

    // Restore session from URL parameter or load new search
    useEffect(() => {
        const initializeSession = async () => {
            // Check if we're resuming a session
            if (resumeSessionId) {
                // If we've already initialized for this session, don't do it again
                if (initializedForRef.current === `session:${resumeSessionId}`) {
                    return;
                }

                const session = chatHistoryService.getSession(resumeSessionId);
                if (session) {
                    // Mark as initialized for this session
                    initializedForRef.current = `session:${resumeSessionId}`;

                    loadSession(session.id);
                    setLocalSessionId(session.id);

                    // Restore the last search response from messages
                    const lastAssistantMessage = [...session.messages]
                        .reverse()
                        .find(m => m.role === 'assistant' && m.searchResponse);

                    if (lastAssistantMessage?.searchResponse) {
                        setSearchResponse(lastAssistantMessage.searchResponse);
                        setCandidates(lastAssistantMessage.searchResponse.matches);
                        if (lastAssistantMessage.searchResponse.matches.length > 0) {
                            setSelectedCandidate(lastAssistantMessage.searchResponse.matches[0]);
                        }
                    }
                    setIsLoading(false);
                    return;
                }
            }

            // New search with job description - only create once per unique job description
            if (jobDescription) {
                // If we've already initialized for this job description, don't create another session
                if (initializedForRef.current === `job:${jobDescription}`) {
                    return;
                }

                // Mark as initialized for this job description
                initializedForRef.current = `job:${jobDescription}`;

                const newSession = createSession(jobDescription);
                setLocalSessionId(newSession.id);
                addUserMessage(jobDescription, 'initial_search');
                await performSearch(jobDescription);
            } else if (!resumeSessionId) {
                setIsLoading(false);
            }
        };

        initializeSession();
    }, [resumeSessionId, jobDescription]); // Only depend on the actual inputs, not derived state

    const performSearch = async (query: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await searchCandidates({ query, top_k: 20 });
            setSearchResponse(response);
            setCandidates(response.matches);
            if (response.matches.length > 0) {
                setSelectedCandidate(response.matches[0]);
            }

            // Save to chat history
            const summary = `Found ${response.matches.length} candidates`;
            addAssistantMessage(summary, 'initial_search', response);
        } catch (err) {
            setError('Failed to search candidates. Please try again.');
            console.error('Search error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefine = useCallback(async (query: string) => {
        if (!searchResponse?.session_id) {
            // If no session, do a new search
            addUserMessage(query, 'followup');
            await performSearch(query);
            return;
        }

        // Save user message
        addUserMessage(query, 'followup');

        setIsRefining(true);
        setError(null);
        try {
            const response = await submitFollowUp({
                session_id: searchResponse.session_id,
                question: query
            });
            setSearchResponse(response);
            setCandidates(response.matches);
            if (response.matches.length > 0 && !response.matches.find(c => c.candidate_id === selectedCandidate?.candidate_id)) {
                setSelectedCandidate(response.matches[0]);
            }

            // Save assistant response
            const summary = `Refined to ${response.matches.length} candidates`;
            addAssistantMessage(summary, 'followup', response);
        } catch (err) {
            setError('Failed to refine search. Please try again.');
            console.error('Refine error:', err);
        } finally {
            setIsRefining(false);
        }
    }, [searchResponse?.session_id, selectedCandidate?.candidate_id, addUserMessage, addAssistantMessage]);

    // Handle selecting a session from sidebar - restore without page reload
    const handleSelectSession = (session: ChatSession) => {
        // Reset state
        setIsLoading(true);
        setError(null);

        // Load session data
        setLocalSessionId(session.id);
        setCurrentSessionId(session.id);

        // Restore the last search response from messages
        const lastAssistantMessage = [...session.messages]
            .reverse()
            .find(m => m.role === 'assistant' && m.searchResponse);

        if (lastAssistantMessage?.searchResponse) {
            setSearchResponse(lastAssistantMessage.searchResponse);
            setCandidates(lastAssistantMessage.searchResponse.matches);
            if (lastAssistantMessage.searchResponse.matches.length > 0) {
                setSelectedCandidate(lastAssistantMessage.searchResponse.matches[0]);
            } else {
                setSelectedCandidate(null);
            }
        } else {
            // No saved response, clear candidates
            setSearchResponse(null);
            setCandidates([]);
            setSelectedCandidate(null);
        }

        setIsLoading(false);

        // Update URL without reload
        navigate(`/candidates?session=${session.id}`, { replace: true });
    };

    // Handle new chat
    const handleNewChat = () => {
        navigate('/');
    };

    // Get current job description (from session or navigation state)
    const activeSession = sessions.find(s => s.id === localSessionId);
    const displayJobDescription = activeSession?.jobDescription || currentSession?.jobDescription || jobDescription;

    return (
        <div className="min-h-screen flex bg-background">
            {/* Chat History Sidebar */}
            <ChatHistorySidebar
                sessions={sessions}
                currentSessionId={localSessionId}
                isCollapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                onSelectSession={handleSelectSession}
                onDeleteSession={deleteSession}
                onRenameSession={renameSession}
                onNewChat={handleNewChat}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                        >
                            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                        </button>
                        <div>
                            <h1 className="text-lg font-semibold text-foreground">
                                Candidate Results
                            </h1>
                            {displayJobDescription && (
                                <p className="text-sm text-muted-foreground truncate max-w-md">
                                    {displayJobDescription.substring(0, 60)}…
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/admin')}
                        className="p-2 rounded-lg hover:bg-accent transition-subtle"
                    >
                        <Settings className="w-5 h-5 text-muted-foreground" />
                    </button>
                </header>

                {/* Error banner */}
                {error && (
                    <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {/* Loading state */}
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                            <p className="text-muted-foreground">Searching for candidates…</p>
                        </div>
                    </div>
                ) : !displayJobDescription ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-muted-foreground mb-4">No job description provided</p>
                            <button
                                onClick={() => navigate('/')}
                                className="btn-primary"
                            >
                                Go back and enter a job description
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Main content */
                    <div className="flex-1 flex flex-col overflow-hidden pb-28">
                        {/* Split view container */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Candidate list - left panel */}
                            <aside className="w-80 lg:w-96 flex-shrink-0 border-r border-border overflow-y-auto pb-28">
                                <CandidateList
                                    candidates={candidates}
                                    selectedId={selectedCandidate?.candidate_id || null}
                                    onSelect={setSelectedCandidate}
                                    totalScanned={searchResponse?.total_candidates_scanned}
                                />
                            </aside>

                            {/* Candidate detail - right panel */}
                            <main className="flex-1 overflow-y-auto pb-28">
                                {selectedCandidate ? (
                                    <CandidateDetail
                                        candidate={selectedCandidate}
                                        explanation={searchResponse?.explanation}
                                    />
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-muted-foreground h-full">
                                        {candidates.length === 0
                                            ? 'No candidates found matching your criteria'
                                            : 'Select a candidate to view details'
                                        }
                                    </div>
                                )}
                            </main>
                        </div>

                        {/* Follow-up input - full width at the bottom */}
                        <FollowUpInput onSubmit={handleRefine} isLoading={isRefining} />
                    </div>
                )}
            </div>
        </div>
    );
}
