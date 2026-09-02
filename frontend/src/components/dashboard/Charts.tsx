import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COLORS = {
  primary: '#6366F1',
  secondary: '#8B5CF6',
  accent: '#06B6D4',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const tooltipStyle = {
  borderRadius: '0.75rem',
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 25px rgba(15,23,42,0.08)',
  fontSize: '12px',
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const UploadTrendChart = ({
  data,
}: {
  data: Array<{ date: string; uploads: number; verifications?: number; transactions?: number }>;
}) => (
  <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="gUploads" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.35} />
          <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} />
      <Area
        type="monotone"
        dataKey="uploads"
        name="Uploads"
        stroke={COLORS.primary}
        strokeWidth={2}
        fill="url(#gUploads)"
      />
    </AreaChart>
  </ResponsiveContainer>
);

export const VerificationTrendChart = ({
  data,
}: {
  data: Array<{ date: string; verifications: number }>;
}) => (
  <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="gVerify" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} />
      <Area
        type="monotone"
        dataKey="verifications"
        name="Verifications"
        stroke={COLORS.accent}
        strokeWidth={2}
        fill="url(#gVerify)"
      />
    </AreaChart>
  </ResponsiveContainer>
);

export const VerificationResultPie = ({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) => {
  const colors = [COLORS.success, COLORS.danger, COLORS.warning];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          strokeWidth={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const TransactionBarChart = ({
  data,
}: {
  data: Array<{ date: string; transactions: number }>;
}) => (
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
      <Bar dataKey="transactions" name="Transactions" fill={COLORS.secondary} radius={[6, 6, 0, 0]} maxBarSize={28} />
    </BarChart>
  </ResponsiveContainer>
);

export const UserGrowthChart = ({
  data,
}: {
  data: Array<{ date: string; users: number; uploads: number }>;
}) => (
  <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.secondary} stopOpacity={0.3} />
          <stop offset="100%" stopColor={COLORS.secondary} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} />
      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
      <Area type="monotone" dataKey="users" name="New users" stroke={COLORS.secondary} strokeWidth={2} fill="url(#gUsers)" />
      <Area type="monotone" dataKey="uploads" name="Uploads" stroke={COLORS.primary} strokeWidth={2} fill="transparent" />
    </AreaChart>
  </ResponsiveContainer>
);

/** Donut with the total displayed in the center. */
export const DonutWithCenter = ({
  data,
  centerLabel,
}: {
  data: Array<{ name: string; value: number }>;
  centerLabel: string;
}) => {
  const colors = [COLORS.success, COLORS.danger, COLORS.warning];
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={95}
            paddingAngle={3}
            strokeWidth={2}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 -mt-5 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-dark">{total}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{centerLabel}</span>
      </div>
    </div>
  );
};

/** Horizontal bar chart for document type distribution. */
export const DocTypeBarChart = ({ data }: { data: Array<{ type: string; count: number }> }) => (
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
      <XAxis
        type="number"
        allowDecimals={false}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        type="category"
        dataKey="type"
        width={52}
        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
      <Bar dataKey="count" name="Documents" fill={COLORS.accent} radius={[0, 6, 6, 0]} maxBarSize={22} />
    </BarChart>
  </ResponsiveContainer>
);

interface BlockchainDay {
  date: string;
  confirmed: number;
  failed: number;
  pending: number;
}

/** Stacked bars for blockchain registration activity. */
export const BlockchainStackedChart = ({ data }: { data: BlockchainDay[] }) => (
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={{ fontSize: 11, fill: '#94a3b8' }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
      <Bar dataKey="confirmed" stackId="tx" name="Confirmed" fill={COLORS.success} radius={[0, 0, 0, 0]} maxBarSize={26} />
      <Bar dataKey="pending" stackId="tx" name="Pending" fill={COLORS.warning} maxBarSize={26} />
      <Bar dataKey="failed" stackId="tx" name="Failed" fill={COLORS.danger} radius={[4, 4, 0, 0]} maxBarSize={26} />
    </BarChart>
  </ResponsiveContainer>
);

export { COLORS };
