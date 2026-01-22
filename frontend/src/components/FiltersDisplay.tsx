import { FilterIntent } from '../types';
import { Filter, CheckCircle } from 'lucide-react';

interface FiltersDisplayProps {
    filters: FilterIntent;
    appliedFilters: string[];
}

export default function FiltersDisplay({
    filters,
    appliedFilters,
}: FiltersDisplayProps) {
    if (appliedFilters.length === 0) return null;

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
                <Filter className="w-4 h-4 text-blue-600" />
                <h3 className="font-medium text-blue-800">Extracted Filters</h3>
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                    Soft constraints - no hard exclusions
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {appliedFilters.map((filter, idx) => (
                    <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 bg-white border border-blue-200 rounded-full text-sm text-blue-800"
                    >
                        <CheckCircle className="w-3 h-3 mr-1.5 text-blue-500" />
                        {filter}
                    </span>
                ))}
            </div>
            <p className="mt-3 text-xs text-blue-600">
                Confidence: {Math.round(filters.extraction_confidence * 100)}% •
                All filters are soft - candidates are ranked, not excluded
            </p>
        </div>
    );
}
