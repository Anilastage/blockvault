import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Download,
  CheckCircle2,
  XCircle,
  BellOff,
  MailOpen,
  FileCheck2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/context/ToastContext';
import {
  useNotificationList,
  useMarkRead,
  useMarkAllRead,
} from '@/hooks/useNotifications';
import { getApiErrorMessage } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import type { NotificationType } from '@/types';

const typeIcon = (type: NotificationType) => {
  switch (type) {
    case 'DOCUMENT_VERIFIED':
      return { icon: ShieldCheck, cls: 'bg-success-100 text-success-600' };
    case 'ACCESS_REQUESTED':
      return { icon: Download, cls: 'bg-primary-100 text-primary-600' };
    case 'ACCESS_APPROVED':
      return { icon: CheckCircle2, cls: 'bg-success-100 text-success-600' };
    case 'ACCESS_DENIED':
      return { icon: XCircle, cls: 'bg-danger-100 text-danger' };
    case 'DOCUMENT_DOWNLOADED':
      return { icon: FileCheck2, cls: 'bg-warning-100 text-warning-600' };
    default:
      return { icon: MailOpen, cls: 'bg-slate-100 text-slate-500' };
  }
};

export const NotificationsPage = () => {
  const toast = useToast();
  const { data, isLoading, isError, error } = useNotificationList(30);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const markAllRead = async () => {
    try {
      const marked = await markAll.mutateAsync();
      if (marked > 0) toast(`Marked ${marked} notifications as read`, 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Could not update notifications');
    }
  };

  const handleOpen = async (id: string) => {
    if (!(data?.notifications.find((n) => n._id === id)?.read ?? true)) {
      markRead.mutate(id);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-dark">Notifications</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.notifications.some((n) => !n.read)}
          onClick={() => void markAllRead()}
        >
          Mark all as read
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {isError && (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500">{getApiErrorMessage(error)}</p>
        </Card>
      )}

      {!isLoading && data && data.notifications.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <BellOff className="h-9 w-9 text-slate-300" />
          <p className="font-semibold text-dark">No notifications yet</p>
          <p className="max-w-sm text-sm text-slate-500">
            When someone verifies or requests a copy of your documents, you will see it here in
            real time.
          </p>
          <Link to="/verify" className="mt-2 text-sm font-semibold text-primary-600 hover:underline">
            Verify a document →
          </Link>
        </Card>
      )}

      {!isLoading && data && data.notifications.length > 0 && (
        <div className="space-y-2.5">
          {data.notifications.map((n) => {
            const { icon: Icon, cls } = typeIcon(n.type);
            return (
              <button
                key={n._id}
                onClick={() => void handleOpen(n._id)}
                className={`block w-full rounded-xl border text-left transition-all ${
                  n.read ? 'border-slate-100 bg-white' : 'border-primary-200 bg-primary-50/40'
                } p-4 hover:border-primary-300`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cls}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-dark">{n.title}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                  </div>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};