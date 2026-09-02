import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Boxes } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { blockchainService } from '@/services/blockchainService';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { formatDateTime } from '@/utils/format';

export const AdminTransactionsPage = () => {
  const transactions = useQuery({
    queryKey: ['admin', 'transactions'],
    queryFn: adminService.transactions,
  });
  const status = useQuery({ queryKey: ['blockchain', 'status'], queryFn: () => blockchainService.status() });

  const rows = transactions.data ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="overflow-hidden">
        {transactions.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-7 w-7" />}
            title="No Blockchain Activity Yet"
            message="Blockchain transactions will appear here after document hashes are registered."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-th">Blockchain Receipt</th>
                  <th className="table-th">Document</th>
                  <th className="table-th">Owner</th>
                  <th className="table-th">Document Fingerprint</th>
                  <th className="table-th">Block</th>
                  <th className="table-th">Timestamp</th>
                  <th className="table-th">Status</th>
                  <th className="table-th text-right">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((doc) => {
                  const explorerUrl = doc.transactionHash
                    ? blockchainService.explorerTxUrl(status.data?.explorerUrl, doc.transactionHash)
                    : null;
                  return (
                    <tr key={doc._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td"><HashDisplay value={doc.transactionHash ?? ''} head={8} tail={6} copyable={false} /></td>
                      <td className="table-td max-w-[180px] truncate" title={doc.originalName}>{doc.originalName}</td>
                      <td className="table-td whitespace-nowrap text-slate-500">
                        {typeof doc.userId === 'object' && doc.userId ? doc.userId.email : '—'}
                      </td>
                      <td className="table-td"><HashDisplay value={doc.sha256Hash} head={8} tail={6} /></td>
                      <td className="table-td">{doc.blockNumber ?? '—'}</td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(doc.uploadedAt)}</td>
                      <td className="table-td"><StatusBadge status={doc.blockchainStatus} /></td>
                      <td className="table-td text-right">
                        {explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50"
                            aria-label={`View transaction ${doc.transactionHash} on the block explorer`}
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">No explorer</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {status.data && !status.data.rpcHealthy && (
        <p className="text-center text-xs text-warning-600">
          The blockchain RPC endpoint is currently unreachable — statuses reflect stored metadata.
        </p>
      )}
    </div>
  );
};
