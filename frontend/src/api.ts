/**
 * API client for the recruitment assistant backend.
 */

import axios from 'axios';
import type {
    SearchRequest,
    SearchResponse,
    FollowUpRequest,
    IngestionResult,
    BatchIngestionResult,
    BulkUploadStatus,
    IngestionStatusResponse,
} from './types';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const recruitmentApi = {
    // Health check
    async healthCheck(): Promise<{ status: string }> {
        const response = await api.get('/health');
        return response.data;
    },

    // Search
    async search(request: SearchRequest): Promise<SearchResponse> {
        const response = await api.post('/search', request);
        return response.data;
    },

    // Follow-up
    async followUp(request: FollowUpRequest): Promise<SearchResponse> {
        const response = await api.post('/followup', request);
        return response.data;
    },

    // Get candidate details
    async getCandidate(candidateId: string): Promise<{
        candidate_id: string;
        chunks: Array<Record<string, unknown>>;
        metadata: Record<string, unknown>;
    }> {
        const response = await api.get(`/candidates/${candidateId}`);
        return response.data;
    },

    // Ingest text
    async ingestText(
        text: string,
        candidateId?: string
    ): Promise<IngestionResult> {
        const response = await api.post('/ingest/text', {
            text,
            candidate_id: candidateId,
        });
        return response.data;
    },

    // Create and ingest samples
    async createSamples(): Promise<BatchIngestionResult> {
        const response = await api.post('/ingest/samples');
        return response.data;
    },

    // Bulk upload PDFs
    async bulkUploadPdfs(files: File[]): Promise<BulkUploadStatus> {
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });

        const response = await api.post('/ingest/bulk-pdf', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    // Get ingestion status
    async getIngestionStatus(): Promise<IngestionStatusResponse> {
        const response = await api.get('/ingest/status');
        return response.data;
    },

    // Get stats
    async getStats(): Promise<{
        status: string;
        collections: Record<string, unknown>;
    }> {
        const response = await api.get('/stats');
        return response.data;
    },

    // Parse PDF to text
    async parsePdf(file: File): Promise<{
        text: string;
        pages: number;
        success: boolean;
    }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await api.post('/parse-pdf', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },
};

export default recruitmentApi;

// Named exports for convenience
export const searchCandidates = recruitmentApi.search;
export const submitFollowUp = recruitmentApi.followUp;
export const getCandidateDetails = recruitmentApi.getCandidate;
export const ingestSamples = recruitmentApi.createSamples;
export const parsePdf = recruitmentApi.parsePdf;
