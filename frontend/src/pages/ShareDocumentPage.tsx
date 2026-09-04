import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Share2,
  Download,
  KeyRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { documentService } from '@/services/documentService';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { ShareDownloadCode } from '@/components/documents/ShareDownloadCode';
import { useAuth } from '@/context/AuthContext';
import { formatBytes, formatDate } from '@/utils/format';
import type { DocumentItem } from '@/types';

export const ShareDocumentPage = () => {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DocumentItem | null>(null);

  const query = useQuery({
    queryKey: ['documents', 'share'],
    queryFn: () => documentService.list({ limit: 100, sortBy: 'uploadedAt', sortOrder: 'desc' }),
  });

  const filtered = useMemo(() => {
    const docs = query.data?.documents ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.originalName.toLowerCase().includes(q));
  }, [query.data, search]);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark">Share a Document</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick one of your documents to generate a temporary 8-character share code.
          </p>
        </div>
        <Link to="/download">
          <Button variant="outline" icon={<Download className="h-4 w-4" />}>
            Download by code
          </Button>
        </Link>
      </div>

      <Card className="p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your documents..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {query.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title={search ? 'No matching documents' : 'No documents yet'}
            message={
              search
                ? 'Try a different search term.'
                : 'Upload a document first, then come back to share it.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((doc) => (
              <li key={doc._id}>
                <button
                  onClick={() => setSelected(doc)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-slate-50/80"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-dark">
                      {doc.originalName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatBytes(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-600">
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Share this document"
        size="lg"
      >
        {selected && (
          <div>
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-dark">{selected.originalName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(selected.fileSize)} · {formatDate(selected.uploadedAt)}
                </p>
              </div>
            </div>

            <ShareDownloadCode documentId={selected._id} />

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-xs text-slate-600">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
              <span>
                The recipient opens{' '}
                <Link to="/download" className="font-mono font-medium text-primary-600 hover:underline" onClick={() => setTimeout(() => setSelected(null), 0)}>
                  {window.location.origin}/download
                </Link>{' '}
                and enters the code above. A new code is generated automatically every 20 minutes.
              </span>
            </div>

            {!isAuthenticated && (
              <p className="mt-2 text-xs text-warning-700">
                Note: recipients must be signed in to BlockVault to redeem a code.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};