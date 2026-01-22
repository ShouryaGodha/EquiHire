import { CandidateMatch } from '../types';
import { CandidateCard } from './CandidateCard';

interface CandidateListProps {
    candidates: CandidateMatch[];
    selectedId: string | null;
    onSelect: (candidate: CandidateMatch) => void;
    totalScanned?: number;
}

export function CandidateList({ candidates, selectedId, onSelect, totalScanned }: CandidateListProps) {
    if (candidates.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                No candidates found
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h2 className="text-sm font-medium text-muted-foreground">
                    {candidates.length} candidates found
                    {totalScanned && totalScanned > candidates.length && (
                        <span className="text-xs ml-1">
                            (from {totalScanned} chunks)
                        </span>
                    )}
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {candidates.map((candidate) => (
                    <CandidateCard
                        key={candidate.candidate_id}
                        candidate={candidate}
                        isSelected={selectedId === candidate.candidate_id}
                        onClick={() => onSelect(candidate)}
                    />
                ))}
            </div>
        </div>
    );
}
