import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  KeyRound,
  MailOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/context/ToastContext';
import { accessService } from '@/services/accessService';
import { getApiErrorMessage } from '@/services/api';
import { formatDateTime, formatBytes } from '@/utils/format';
import type { AccessRequestItem, AccessRequestStatus } from '@/types';

type Tab = 'incoming' | 'outgoing';

const statusMeta: Record<AccessRequestStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-warning-100 text-warning-600' },
  APPROVED: { label: 'Approved', cls: 'bg-success-100 text-success-600' },
  DENIED: { label: 'Denied', cls: 'bg-danger-100 text-danger' },
  USED: { label: 'Link used', cls: 'bg-slate-100 text-slate-500' },
  EXPIRED: { label: 'Expired', cls: 'bg-slate-100 text-slate-500' },
};

const StatusBadge = ({ status }: { status: AccessRequestStatus }) => {
  const meta = statusMeta[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
};

export const AccessRequestsPage = () => {
  const [tab, setTab] = useState<Tab>('incoming');
  return (
    <div className="mx-auto max-w-4xl space-y-4 animate-fade-in">
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {(
          [
            { key: 'incoming', label: 'Received', icon: Inbox },
            { key: 'outgoing', label: 'Sent by me', icon: Send },
          ] as Array<{ key: Tab; label: string; icon: typeof Inbox }>
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === key ? 'bg-white text-dark shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === 'incoming' ? <IncomingRequests /> : <OutgoingRequests />}
    </div>
  );
};

const IncomingRequests = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['access', 'incoming'],
    queryFn: () => accessService.incoming('PENDING'),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['access', 'incoming'] });
    void queryClient.invalidateQueries({ queryKey: ['access', 'outgoing'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const [decisionId, setDecisionId] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approve ? accessService.approve(id) : accessService.deny(id),
    onMutate: ({ id }) => setDecisionId(id),
    onSuccess: (_data, vars) => {
      toast(vars.approve ? 'Access approved.' : 'Request denied.', vars.approve ? 'success' : 'warning');
      invalidate();
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Action failed'),
    onSettled: () => setDecisionId(null),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );

  if (isError)
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-slate-500">{getApiErrorMessage(error)}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </Card>
    );

  if (!data || data.length === 0)
    return (
      <Card className="flex flex-col items-center gap-2 p-12 text-center">
        <MailOpen className="h-9 w-9 text-slate-300" />
        <p className="font-semibold text-dark">No pending access requests</p>
        <p className="max-w-sm text-sm text-slate-500">
          When someone verifies one of your documents and asks to download it, the request appears
          here for real-time approval or denial.
        </p>
      </Card>
    );

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <RequestCard key={r._id} request={r}>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={decide.isPending && decisionId === r._id}
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: r._id, approve: true })}
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              Allow download
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={decide.isPending && decisionId === r._id}
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: r._id, approve: false })}
              icon={<XCircle className="h-4 w-4" />}
            >
              Deny
            </Button>
          </div>
        </RequestCard>
      ))}
    </div>
  );
};

const OutgoingRequests = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['access', 'outgoing'],
    queryFn: () => accessService.myRequests(),
    refetchInterval: 15_000,
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );

  if (isError)
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-slate-500">Could not load your access requests.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </Card>
    );

  if (!data || data.length === 0)
    return (
      <Card className="flex flex-col items-center gap-2 p-12 text-center">
        <KeyRound className="h-9 w-9 text-slate-300" />
        <p className="font-semibold text-dark">No access requests sent</p>
        <p className="max-w-sm text-sm text-slate-500">
          Verify someone else's registered document and request a copy from the owner — it will
          show up here with its approval status.
        </p>
      </Card>
    );

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <RequestCard key={r._id} request={r} />
      ))}
    </div>
  );
};

const RequestCard = ({
  request: r,
  children,
}: {
  request: AccessRequestItem;
  children?: React.ReactNode;
}) => {
  const toast = useToast();
  const doc = typeof r.documentId === 'object' ? r.documentId : null;
  const requester = typeof r.requesterId === 'object' ? r.requesterId : null;
  const [downloading, setDownloading] = useState(false);

  const linkExpired =
    r.status === 'APPROVED' && !!r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now();

  const download = async () => {
    if (!r.accessToken) return;
    setDownloading(true);
    try {
      await accessService.downloadWithToken(r.accessToken, doc?.originalName ?? 'document');
      toast('Document downloaded.', 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-dark">{doc?.originalName ?? 'Document'}</p>
            <StatusBadge status={r.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {requester ? `${requester.fullName} · ${requester.email} · ` : ''}
            {doc?.fileSize ? `${formatBytes(doc.fileSize)} · ` : ''}
            {formatDateTime(r.createdAt)}
          </p>
          {r.reason && (
            <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500 ring-1 ring-slate-100">
              “{r.reason}”
            </p>
          )}
          {linkExpired && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-warning-600">
              <Clock className="h-3.5 w-3.5" /> This download link has expired.
            </p>
          )}
        </div>

        <div className="shrink-0">
          {r.status === 'APPROVED' && r.accessToken && !linkExpired && (
            <Button
              size="sm"
              loading={downloading}
              onClick={() => void download()}
              icon={<Download className="h-4 w-4" />}
            >
              One-time download
            </Button>
          )}
          {r.status === 'PENDING' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Awaiting owner
            </span>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
};