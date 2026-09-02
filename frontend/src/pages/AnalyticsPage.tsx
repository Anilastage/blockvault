import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  FileText,
  ShieldCheck,
  Percent,
  Link2,
  Boxes,
  Download,
} from 'lucide-react';
import { analyticsService, type AnalyticsRange } from '@/services/analyticsService';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import {
  UploadTrendChart,
  VerificationTrendChart,
  DonutWithCenter,
  DocTypeBarChart,
  BlockchainStackedChart,
} from '@/components/dashboard/Charts';

const ranges = [
  { value: '7D', label: 'Last 7 Days' },
  { value: '30D', label: 'Last 30 Days' },
  { value: '90D', label: 'Last 90 Days' },
  { value: 'YEAR', label: 'This Year' },
] as const;

type RangeValue = (typeof ranges)[number]['value'];

export const AnalyticsPage = () => {
  const toast = useToast();
  const [rangeValue, setRangeValue] = useState<RangeValue>('30D');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const range: AnalyticsRange = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
    }
    if (rangeValue === 'YEAR') {
      const start = new Date(new Date().getFullYear(), 0, 1);
      return { from: start.toISOString() };
    }
    const days = rangeValue === '7D' ? 7 : rangeValue === '90D' ? 90 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return { from: d.toISOString() };
  }, [rangeValue, customFrom, customTo, useCustom]);

  const overview = useQuery({
    queryKey: ['analytics', 'overview', range],
    queryFn: () => analyticsService.overview(range),
  });
  const documents = useQuery({
    queryKey: ['analytics', 'documents', range],
    queryFn: () => analyticsService.documents(range),
  });
  const verifications = useQuery({
    queryKey: ['analytics', 'verifications', range],
    queryFn: () => analyticsService.verifications(range),
  });
  const blockchain = useQuery({
    queryKey: ['analytics', 'blockchain', range],
    queryFn: () => analyticsService.blockchain(range),
  });

  const exportMutation = useMutation({ mutationFn: () => analyticsService.exportCsv() });

  const applyCustom = () => {
    if (!customFrom || !customTo) {
      toast('Please pick both a start and end date.', 'warning');
      return;
    }
    setUseCustom(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:-mt-2 lg:items-center lg:justify-between">
        <p className="text-sm text-slate-500">
          Monitor document activity, verification performance, and blockchain usage.
        </p>
        <Button
          variant="outline"
          size="sm"
          icon={exportMutation.isPending ? undefined : <Download className="h-4 w-4" />}
          loading={exportMutation.isPending}
          onClick={() =>
            exportMutation.mutate(undefined, {
              onSuccess: () => toast('Report downloaded.', 'success'),
              onError: (err) => toast(getApiErrorMessage(err), 'error'),
            })
          }
        >
          Export Report
        </Button>
      </div>

      {/* Date selector */}
      <Card className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <span className="text-sm font-semibold text-dark">Timeframe:</span>
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setRangeValue(r.value);
                setUseCustom(false);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !useCustom && rangeValue === r.value
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="Custom start date"
            className="input-base !w-auto !py-1.5 text-xs"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="Custom end date"
            className="input-base !w-auto !py-1.5 text-xs"
          />
          <button
            onClick={applyCustom}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              useCustom
                ? 'bg-primary-500 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-300'
            }`}
          >
            Custom Range
          </button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Documents"
          value={overview.data?.totalDocuments ?? 0}
          loading={overview.isLoading}
          icon={<FileText className="h-5 w-5" />}
          accentClass="bg-primary-500"
        />
        <StatCard
          title="Total Verifications"
          value={overview.data?.totalVerifications ?? 0}
          loading={overview.isLoading}
          icon={<ShieldCheck className="h-5 w-5" />}
          accentClass="bg-secondary-500"
        />
        <StatCard
          title="Verification Success Rate"
          value={`${overview.data?.verificationSuccessRate ?? 0}%`}
          loading={overview.isLoading}
          icon={<Percent className="h-5 w-5" />}
          accentClass="bg-success"
        />
        <StatCard
          title="Blockchain Registrations"
          value={overview.data?.blockchainRegistrations ?? 0}
          loading={overview.isLoading}
          icon={<Link2 className="h-5 w-5" />}
          accentClass="bg-accent-600"
        />
        <StatCard
          title="Documents on Blockchain"
          value={overview.data?.blockchainDocumentCount ?? 0}
          loading={overview.isLoading}
          icon={<Boxes className="h-5 w-5" />}
          accentClass="bg-purple-500"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="Document Activity" subtitle="Uploads over the selected period" loading={documents.isLoading}>
          <UploadTrendChart data={documents.data?.daily.map((d) => ({ date: d.date, uploads: d.count })) ?? []} />
        </ChartCard>
        <ChartCard
          title="Verification Performance"
          subtitle="Results distribution — center shows total attempts"
          loading={verifications.isLoading}
        >
          {(verifications.data?.results ?? []).every((r) => r.value === 0) ? (
            <ChartPlaceholder message="No verification activity in this period." />
          ) : (
            <DonutWithCenter data={verifications.data?.results ?? []} centerLabel="Verifications" />
          )}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="Document Type Analytics" subtitle="Distribution by file format" loading={documents.isLoading}>
          {documents.data?.byType.length === 0 ? (
            <ChartPlaceholder message="No documents uploaded in this period." />
          ) : (
            <DocTypeBarChart data={documents.data?.byType ?? []} />
          )}
        </ChartCard>
        <ChartCard
          title="Blockchain Registrations"
          subtitle={`Confirmed ${blockchain.data?.totals.confirmed ?? 0} · Pending ${blockchain.data?.totals.pending ?? 0} · Failed ${blockchain.data?.totals.failed ?? 0}`}
          loading={blockchain.isLoading}
        >
          <BlockchainStackedChart
            data={
              blockchain.data?.daily.map((d) => ({
                date: d.date,
                confirmed: d.confirmed,
                failed: d.failed,
                pending: d.pending,
              })) ?? []
            }
          />
        </ChartCard>
      </div>

      {/* Verification trend full width */}
      <ChartCard title="Verification Trend" subtitle="Daily verification volume" loading={verifications.isLoading}>
        <VerificationTrendChart
          data={verifications.data?.daily.map((d) => ({ date: d.date, verifications: d.count })) ?? []}
        />
      </ChartCard>
    </div>
  );
};

const ChartCard = ({
  title,
  subtitle,
  loading,
  children,
}: {
  title: string;
  subtitle?: string;
  loading?: boolean;
  children: React.ReactNode;
}) => (
  <Card className="p-5">
    <div className="mb-4">
      <h3 className="font-semibold text-dark">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
    </div>
    {loading ? (
      <Skeleton className="h-[260px]" />
    ) : (
      children
    )}
  </Card>
);

const ChartPlaceholder = ({ message }: { message: string }) => (
  <div className="flex h-[260px] items-center justify-center text-center text-sm text-slate-400">
    {message}
  </div>
);
