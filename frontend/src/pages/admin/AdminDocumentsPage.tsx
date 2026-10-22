import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/ui/Card';
import { StatusBadge, VerificationBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { formatBytes, formatDate, fileExtension } from '@/utils/format';

const filters = ['ALL', 'CONFIRMED', 'PENDING', 'FAILED'] as const;

export const AdminDocumentsPage = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatusFilterValue] = useState<(typeof filters)[number]>('ALL');

  const documents = useQuery({
    queryKey: ['admin', 'documents', { page, search, status }],
    queryFn: () => adminService.documents({ page, limit: 10, search: search || undefined, status }),
  });

  const rows = documents.data?.documents ?? [];
  const pagination = documents.data?.pagination;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="relative w-full lg:max-w-md"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, hash or transaction..."
            aria-label="Search all documents"
            className="input-base pl-9"
          />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => {
                setStatusFilterValue(f);
                setPage(1);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                status === f
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-300'
              }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {documents.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title="No documents found"
            message={search || status !== 'ALL' ? 'Nothing matches your filters.' : 'No documents have been uploaded yet.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Document</th>
                    <th className="table-th">Owner</th>
                    <th className="table-th">Fingerprint</th>
                    <th className="table-th">Size</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Integrity</th>
                    <th className="table-th">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((doc) => (
                    <tr key={doc._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td max-w-[200px]">
                        <Link to={`/documents/${doc._id}`} className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 font-mono text-[10px] font-bold text-primary-500">
                            {fileExtension(doc.originalName).slice(0, 4)}
                          </span>
                          <span className="truncate font-medium text-dark hover:text-primary-600">
                            {doc.originalName}
                          </span>
                        </Link>
                      </td>
                      <td className="table-td whitespace-nowrap">
                        {typeof doc.userId === 'object' && doc.userId ? (
                          <Link
                            to={`/admin/users/${doc.userId._id}`}
                            className="block hover:text-primary-600 hover:underline"
                          >
                            <span className="block font-medium text-dark">{doc.userId.fullName}</span>
                            <span className="block text-xs text-slate-400">{doc.userId.email}</span>
                          </Link>
                        ) : (
                          '�?"'
                        )}
                      </td>
                      <td className="table-td"><HashDisplay value={doc.sha256Hash} head={8} tail={6} /></td>
                      <td className="table-td whitespace-nowrap">{formatBytes(doc.fileSize)}</td>
                      <td className="table-td"><StatusBadge status={doc.blockchainStatus} /></td>
                      <td className="table-td"><VerificationBadge status={doc.verificationStatus} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDate(doc.uploadedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && <PaginationControls pagination={pagination} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400">
        Blockchain hashes are immutable records — they cannot be edited from this panel.
      </p>
    </div>
  );
};
