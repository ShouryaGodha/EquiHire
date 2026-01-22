import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    Database,
    Upload,
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertCircle,
    Loader2,
    ArrowLeft,
    File,
    X,
    CheckCircle2,
} from 'lucide-react';
import { recruitmentApi } from '../api';

export default function AdminPage() {
    const navigate = useNavigate();
    const [resumeText, setResumeText] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get stats
    const statsQuery = useQuery({
        queryKey: ['stats'],
        queryFn: recruitmentApi.getStats,
        refetchInterval: 10000,
    });

    // Get ingestion status
    const statusQuery = useQuery({
        queryKey: ['ingestionStatus'],
        queryFn: recruitmentApi.getIngestionStatus,
        refetchInterval: 5000,
    });

    // Bulk upload mutation
    const bulkUploadMutation = useMutation({
        mutationFn: (files: File[]) => recruitmentApi.bulkUploadPdfs(files),
        onSuccess: () => {
            setSelectedFiles([]);
            statsQuery.refetch();
            statusQuery.refetch();
        },
    });

    // Ingest text mutation
    const ingestTextMutation = useMutation({
        mutationFn: (text: string) => recruitmentApi.ingestText(text),
        onSuccess: () => {
            setResumeText('');
            statsQuery.refetch();
            statusQuery.refetch();
        },
    });

    const handleIngestText = () => {
        if (resumeText.trim()) {
            ingestTextMutation.mutate(resumeText);
        }
    };

    // File handling functions
    const handleFileSelect = (files: FileList | null) => {
        if (!files) return;
        const pdfFiles = Array.from(files).filter(
            (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );
        const newFiles = [...selectedFiles, ...pdfFiles].slice(0, 10);
        setSelectedFiles(newFiles);
    };

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files);
    }, [selectedFiles]);

    const handleBulkUpload = () => {
        if (selectedFiles.length > 0) {
            bulkUploadMutation.mutate(selectedFiles);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 -ml-2 rounded-lg hover:bg-accent transition-subtle"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </button>
                <h1 className="text-lg font-semibold text-foreground">Administration</h1>
            </header>

            <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

                {/* System Status Banner */}
                <div className={`rounded-xl p-4 border ${statusQuery.data?.is_ready_for_search
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-amber-50 border-amber-200'
                    }`}>
                    <div className="flex items-center gap-3">
                        {statusQuery.data?.is_ready_for_search ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-amber-600" />
                        )}
                        <div>
                            <h3 className={`font-semibold ${statusQuery.data?.is_ready_for_search
                                ? 'text-emerald-800'
                                : 'text-amber-800'
                                }`}>
                                {statusQuery.data?.is_ready_for_search
                                    ? 'System Ready for Search'
                                    : 'System Not Ready'}
                            </h3>
                            <p className={`text-sm ${statusQuery.data?.is_ready_for_search
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                                }`}>
                                {statusQuery.data?.message || 'Checking status...'}
                            </p>
                        </div>
                        {statusQuery.isFetching && (
                            <Loader2 className="w-4 h-4 animate-spin ml-auto text-muted-foreground" />
                        )}
                    </div>
                </div>

                {/* Stats Card */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground flex items-center">
                            <Database className="w-5 h-5 mr-2 text-primary" />
                            System Statistics
                        </h2>
                        <button
                            onClick={() => statsQuery.refetch()}
                            className="text-muted-foreground hover:text-foreground transition-subtle"
                            disabled={statsQuery.isFetching}
                        >
                            <RefreshCw
                                className={`w-4 h-4 ${statsQuery.isFetching ? 'animate-spin' : ''}`}
                            />
                        </button>
                    </div>

                    {statsQuery.data && (
                        <div className="grid md:grid-cols-2 gap-4">
                            {Object.entries(statsQuery.data.collections || {}).map(
                                ([name, info]: [string, unknown]) => {
                                    const collectionInfo = info as Record<string, unknown>;
                                    return (
                                        <div
                                            key={name}
                                            className="bg-secondary/50 rounded-lg p-4 border border-border"
                                        >
                                            <h3 className="font-medium text-foreground mb-2">{name}</h3>
                                            {collectionInfo.error ? (
                                                <p className="text-destructive text-sm">
                                                    Error: {collectionInfo.error as string}
                                                </p>
                                            ) : (
                                                <div className="space-y-1 text-sm">
                                                    <p className="text-muted-foreground">
                                                        Points:{' '}
                                                        <span className="font-medium text-foreground">
                                                            {collectionInfo.points_count as number}
                                                        </span>
                                                    </p>
                                                    <p className="text-muted-foreground">
                                                        Status:{' '}
                                                        <span
                                                            className={`font-medium ${collectionInfo.status === 'green'
                                                                ? 'text-emerald-600'
                                                                : 'text-amber-600'
                                                                }`}
                                                        >
                                                            {collectionInfo.status as string}
                                                        </span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    )}
                </div>

                {/* BULK PDF UPLOAD */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                        <Upload className="w-5 h-5 mr-2 text-primary" />
                        Upload PDF Resumes
                    </h2>
                    <p className="text-muted-foreground mb-4">
                        Upload up to 10 PDF resumes at once. The system will extract text, generate embeddings, and make them searchable.
                    </p>

                    {/* Drop Zone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                            ${isDragging
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50 hover:bg-accent/50'
                            }
                            ${selectedFiles.length >= 10 ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            multiple
                            onChange={(e) => handleFileSelect(e.target.files)}
                            className="hidden"
                            disabled={selectedFiles.length >= 10}
                        />
                        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className="text-foreground font-medium mb-1">
                            {isDragging ? 'Drop PDF files here' : 'Click or drag PDF files here'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Up to 10 PDF files • {10 - selectedFiles.length} slots remaining
                        </p>
                    </div>

                    {/* Selected Files List */}
                    {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-sm font-medium text-foreground">
                                Selected Files ({selectedFiles.length}/10)
                            </p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {selectedFiles.map((file, index) => (
                                    <div
                                        key={`${file.name}-${index}`}
                                        className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <File className="w-4 h-4 text-red-500 flex-shrink-0" />
                                            <span className="text-sm text-foreground truncate">
                                                {file.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground flex-shrink-0">
                                                ({(file.size / 1024).toFixed(1)} KB)
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFile(index);
                                            }}
                                            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Upload Button */}
                    <div className="mt-4 flex items-center gap-4">
                        <button
                            onClick={handleBulkUpload}
                            disabled={selectedFiles.length === 0 || bulkUploadMutation.isPending}
                            className="btn-primary"
                        >
                            {bulkUploadMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing {selectedFiles.length} files...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Upload & Process {selectedFiles.length > 0 ? selectedFiles.length : ''} PDF{selectedFiles.length !== 1 ? 's' : ''}
                                </>
                            )}
                        </button>
                        {selectedFiles.length > 0 && !bulkUploadMutation.isPending && (
                            <button
                                onClick={() => setSelectedFiles([])}
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>

                    {/* Upload Progress */}
                    {bulkUploadMutation.isPending && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <div>
                                    <p className="font-medium text-blue-800">Processing PDFs...</p>
                                    <p className="text-sm text-blue-700">
                                        Extracting text and generating embeddings. This may take a moment.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Success Message */}
                    {bulkUploadMutation.isSuccess && (
                        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-medium text-emerald-800">Upload Complete!</p>
                                    <p className="text-sm text-emerald-700 mt-1">
                                        {bulkUploadMutation.data.successful} of {bulkUploadMutation.data.total_files} files processed.
                                        {' '}{bulkUploadMutation.data.results.reduce((sum: number, r: any) => sum + r.chunks_created, 0)} chunks created.
                                    </p>
                                    {bulkUploadMutation.data.failed > 0 && (
                                        <div className="mt-2 text-sm text-amber-700">
                                            <p className="font-medium">{bulkUploadMutation.data.failed} file(s) failed:</p>
                                            <ul className="list-disc list-inside mt-1">
                                                {bulkUploadMutation.data.errors.map((error: string, i: number) => (
                                                    <li key={i}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {bulkUploadMutation.isError && (
                        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <div className="flex items-center text-destructive">
                                <XCircle className="w-4 h-4 mr-2" />
                                Error uploading files:{' '}
                                {bulkUploadMutation.error instanceof Error
                                    ? bulkUploadMutation.error.message
                                    : 'Unknown error'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Manual Ingest */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                        <Upload className="w-5 h-5 mr-2 text-primary" />
                        Ingest Resume
                    </h2>
                    <p className="text-muted-foreground mb-4">
                        Paste resume text below to add a new candidate to the database.
                    </p>
                    <textarea
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        placeholder="Paste resume text here..."
                        rows={10}
                        className="textarea-field font-mono text-sm"
                    />
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {resumeText.length} characters
                        </p>
                        <button
                            onClick={handleIngestText}
                            disabled={!resumeText.trim() || ingestTextMutation.isPending}
                            className="btn-primary"
                        >
                            {ingestTextMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Ingest Resume
                                </>
                            )}
                        </button>
                    </div>

                    {ingestTextMutation.isSuccess && (
                        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex items-center text-emerald-700">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Successfully ingested resume:{' '}
                                {ingestTextMutation.data.chunks_created} chunks created
                            </div>
                        </div>
                    )}

                    {ingestTextMutation.isError && (
                        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <div className="flex items-center text-destructive">
                                <XCircle className="w-4 h-4 mr-2" />
                                Error ingesting resume:{' '}
                                {ingestTextMutation.error instanceof Error
                                    ? ingestTextMutation.error.message
                                    : 'Unknown error'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Warning */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-amber-800">Important Notes</h3>
                            <ul className="mt-2 text-sm text-amber-700 list-disc list-inside space-y-1">
                                <li>
                                    Metadata extraction is approximate and may be incomplete
                                </li>
                                <li>
                                    All personal data should be handled according to your privacy
                                    policies
                                </li>
                                <li>
                                    Ensure you have consent to process candidate information
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
