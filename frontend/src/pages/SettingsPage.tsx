import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  ShieldCheck,
  Wallet,
  Bell,
  Palette,
  AlertTriangle,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { userService } from "@/services/userService";
import { blockchainService } from "@/services/blockchainService";
import { getApiErrorMessage } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";
const sections = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
] as const;
type SectionId = (typeof sections)[number]["id"];
export const SettingsPage = () => {
  const [active, setActive] = useState<SectionId>("general");
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      {" "}
      <p className="-mt-2 mb-5 text-sm text-slate-500">
        {" "}
        Manage your BlockVault account and application preferences.{" "}
      </p>{" "}
      {/* Section nav — horizontal on mobile, list on desktop */}{" "}
      <div
        className="mb-5 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
        role="tablist"
        aria-label="Settings sections"
      >
        {" "}
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            onClick={() => setActive(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active === id ? "bg-primary-500 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {" "}
            <Icon className="h-4 w-4" /> {label}{" "}
          </button>
        ))}{" "}
      </div>{" "}
      <div className="flex flex-col gap-6 lg:flex-row">
        {" "}
        <Card className="hidden h-fit w-52 shrink-0 p-2 lg:block">
          {" "}
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active === id ? "bg-primary-50 text-primary-600" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {" "}
              <Icon className="h-4 w-4" /> {label}{" "}
            </button>
          ))}{" "}
        </Card>{" "}
        <div className="min-w-0 flex-1 space-y-5">
          {" "}
          {active === "general" && <GeneralSection />}{" "}
          {active === "security" && <SecuritySection />}{" "}
          {active === "wallet" && <WalletSection />}{" "}
          {active === "notifications" && <NotificationsSection />}{" "}
          {active === "appearance" && <AppearanceSection />}{" "}
          <DangerZone onDeleted={logout} />{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
};
/* ---------- General ---------- */ const TIMEZONES = [
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
].filter((v, i, a) => a.indexOf(v) === i);
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
const GeneralSection = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: userService.settings,
  });
  const [timezone, setTimezone] = useState("");
  const [dateFormat, setDateFormat] =
    useState<(typeof DATE_FORMATS)[number]>("DD/MM/YYYY");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (settings.data && !loaded) {
      setTimezone(settings.data.general.timezone);
      setDateFormat(
        settings.data.general.dateFormat as (typeof DATE_FORMATS)[number],
      );
      setLoaded(true);
    }
  }, [settings.data, loaded]);
  const save = useMutation({
    mutationFn: () =>
      userService.updateSettings({
        general: { language: "en", timezone, dateFormat },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast("Preferences saved.", "success");
    },
    onError: (err) => toast(getApiErrorMessage(err), "error"),
  });
  if (settings.isLoading)
    return (
      <Card className="p-6">
        <SkeletonBar />
      </Card>
    );
  return (
    <Card className="p-6">
      {" "}
      <h3 className="mb-4 font-semibold text-dark">General</h3>{" "}
      <div className="space-y-4">
        {" "}
        <Input
          label="Language"
          value="English"
          disabled
          hint="Additional languages are not available yet."
        />{" "}
        <div>
          {" "}
          <label
            htmlFor="tz-select"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Timezone
          </label>{" "}
          <select
            id="tz-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input-base"
          >
            {" "}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}{" "}
          </select>{" "}
        </div>{" "}
        <div>
          {" "}
          <label
            htmlFor="df-select"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Date Format
          </label>{" "}
          <select
            id="df-select"
            value={dateFormat}
            onChange={(e) =>
              setDateFormat(e.target.value as (typeof DATE_FORMATS)[number])
            }
            className="input-base"
          >
            {" "}
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}{" "}
          </select>{" "}
        </div>{" "}
        <div className="flex justify-end pt-1">
          {" "}
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save Preferences
          </Button>{" "}
        </div>{" "}
      </div>{" "}
    </Card>
  );
};
/* ---------- Security ---------- */ const SecuritySection = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: userService.settings,
  });
  const { user } = useAuth();
  const toggle = useMutation({
    mutationFn: (securityAlerts: boolean) =>
      userService.updateSettings({ notifications: { securityAlerts } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast("Security preference updated.", "success");
    },
    onError: (err) => toast(getApiErrorMessage(err), "error"),
  });
  return (
    <>
      {" "}
      <Card className="p-6">
        {" "}
        <h3 className="mb-4 font-semibold text-dark">Security</h3>{" "}
        <div className="divide-y divide-slate-50">
          {" "}
                    <TwoFactorSettings enabled={!!user?.twoFactorEnabled} mfaMethod={user?.mfaMethod} /> {" "}
          <Row
            title="Login Alerts"
            description="Get notified about security-relevant account activity."
          >
            {" "}
            <Toggle
              checked={!!settings.data?.notifications.securityAlerts}
              disabled={toggle.isPending}
              onChange={(v) => toggle.mutate(v)}
              label="Toggle login alerts"
            />{" "}
          </Row>{" "}
          <Row
            title="Password"
            description="Change your password regularly to stay secure."
          >
            {" "}
            <Link to="/profile">
              {" "}
              <Button size="sm" variant="outline">
                Change Password
              </Button>{" "}
            </Link>{" "}
          </Row>{" "}
        </div>{" "}
      </Card>{" "}
      <Card className="p-6">
        {" "}
        <h3 className="mb-4 font-semibold text-dark">Sessions</h3>{" "}
        <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
          {" "}
          <div>
            {" "}
            <p className="text-sm font-medium text-dark">
              Current session
            </p>{" "}
            <p className="mt-0.5 text-xs text-slate-500">
              {" "}
              Signed in as {user?.email} · token expires in 7 days{" "}
            </p>{" "}
          </div>{" "}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1 text-xs font-semibold text-success-600">
            {" "}
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />{" "}
            Active{" "}
          </span>{" "}
        </div>{" "}
      </Card>{" "}
    </>
  );
};
/* ---------- Wallet ---------- */ const WalletSection = () => {
  const wallet = useWallet();
  const status = useQuery({
    queryKey: ["blockchain", "status"],
    queryFn: () => blockchainService.status(),
  });
  return (
    <Card className="p-6">
      {" "}
      <h3 className="mb-4 font-semibold text-dark">Wallet</h3>{" "}
      <div className="mb-5 flex items-center justify-between rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
        {" "}
        <div>
          {" "}
          <p className="text-sm font-medium text-dark">
            {" "}
            {wallet.isConnected
              ? `Connected · ${wallet.shortAccount}`
              : "No wallet connected"}{" "}
          </p>{" "}
          <p className="mt-0.5 text-xs text-slate-500">
            {wallet.isDemoWallet
              ? "Built-in demo wallet — no browser extension needed"
              : "Demo wallet unavailable (no local RPC configured)"}
          </p>{" "}
        </div>{" "}
        {!wallet.isConnected ? (
          <Button
            size="sm"
            loading={wallet.connecting}
            onClick={wallet.connect}
          >
            Connect
          </Button>
        ) : (
          <div className="flex gap-2">
            {" "}
            {!wallet.isCorrectNetwork && (
              <Button
                size="sm"
                variant="warning"
                onClick={() => wallet.switchToExpectedNetwork()}
              >
                {" "}
                Switch Network{" "}
              </Button>
            )}{" "}
            <Button size="sm" variant="outline" onClick={wallet.disconnect}>
              Disconnect
            </Button>{" "}
          </div>
        )}{" "}
      </div>{" "}
      <dl className="space-y-3">
        {" "}
        <InfoRow
          label="Configured Network"
          value={status.data?.networkName ?? "—"}
        />{" "}
        <InfoRow
          label="Network ID"
          value={String(wallet.expectedChainId ?? "—")}
        />{" "}
        <InfoRow
          label="Registration Contract"
          value={
            status.data?.contractAddress ? (
              <span className="flex flex-wrap items-center gap-2">
                {" "}
                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">
                  {" "}
                  {status.data.contractAddress.slice(0, 12)}...
                  {status.data.contractAddress.slice(-8)}{" "}
                </code>{" "}
                {status.data.explorerUrl && (
                  <a
                    href={`${status.data.explorerUrl.replace(/\/$/, "")}/address/${status.data.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    {" "}
                    Explorer <ExternalLink className="h-3 w-3" />{" "}
                  </a>
                )}{" "}
              </span>
            ) : (
              <span className="text-slate-400">Not configured</span>
            )
          }
        />{" "}
      </dl>{" "}
    </Card>
  );
};
/* ---------- Notifications ---------- */ const NOTIFICATION_FIELDS = [
  {
    key: "emailNotifications",
    title: "Email Notifications",
    desc: "Important updates delivered by email.",
  },
  {
    key: "verificationAlerts",
    title: "Verification Alerts",
    desc: "Results when a document verification completes.",
  },
  {
    key: "transactionAlerts",
    title: "Blockchain Transaction Alerts",
    desc: "Confirmations and failures of your registrations.",
  },
  {
    key: "securityAlerts",
    title: "Security Alerts",
    desc: "Sign-ins from new devices and password changes.",
  },
  {
    key: "systemUpdates",
    title: "System Updates",
    desc: "Platform news and maintenance notices.",
  },
] as const;
type NotificationField = (typeof NOTIFICATION_FIELDS)[number]["key"];
const NotificationsSection = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: userService.settings,
  });
  const patch = useMutation({
    mutationFn: ({
      field,
      value,
    }: {
      field: NotificationField;
      value: boolean;
    }) =>
      userService.updateSettings({
        notifications: { [field]: value } as never,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast("Notification preference saved.", "success");
    },
    onError: (err) => toast(getApiErrorMessage(err), "error"),
  });
  if (settings.isLoading)
    return (
      <Card className="p-6">
        <SkeletonBar />
      </Card>
    );
  return (
    <Card className="p-6">
      {" "}
      <h3 className="mb-4 font-semibold text-dark">Notifications</h3>{" "}
      <div className="divide-y divide-slate-50">
        {" "}
        {NOTIFICATION_FIELDS.map(({ key, title, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
          >
            {" "}
            <div>
              {" "}
              <p className="text-sm font-medium text-dark">{title}</p>{" "}
              <p className="mt-0.5 text-xs text-slate-500">{desc}</p>{" "}
            </div>{" "}
            <Toggle
              checked={!!settings.data?.notifications[key]}
              disabled={patch.isPending}
              onChange={(v) => patch.mutate({ field: key, value: v })}
              label={`Toggle ${title}`}
            />{" "}
          </div>
        ))}{" "}
      </div>{" "}
    </Card>
  );
};
/* ---------- Appearance ---------- */ const AppearanceSection = () => {
  const toast = useToast();
  const { theme, resolved, setTheme: applyTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const options = [
    { value: "light", label: "Light", desc: "The signature BlockVault look." },
    {
      value: "dark",
      label: "Dark",
      desc: "A low-light interface designed for comfort.",
    },
    { value: "system", label: "System", desc: "Follow your OS setting." },
  ] as const;
  const choose = async (value: (typeof options)[number]["value"]) => {
    if (value === theme) return;
    setSyncing(true);
    applyTheme(value);
    setSyncing(false);
    toast(`Theme set to ${value}.`, "success");
  };
  return (
    <Card className="p-6">
      {" "}
      <h3 className="mb-1 font-semibold text-dark">Appearance</h3>{" "}
      <p className="mb-4 text-xs text-slate-400">
        {" "}
        {resolved === "dark"
          ? "Dark mode is active and applied instantly."
          : "Light mode is active and applied instantly."}{" "}
      </p>{" "}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {" "}
        {options.map((o) => {
          const selected = theme === o.value;
          return (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              disabled={syncing}
              className={`rounded-xl border-2 p-4 text-left transition-all ${selected ? "border-primary-500 bg-primary-50/60 dark:border-primary-400 dark:bg-primary-500/10" : "border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-500/50"}`}
            >
              {" "}
              <div
                className={`mb-2 h-10 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-white dark:border-slate-600 ${o.value === "dark" ? "from-slate-800 to-slate-950 dark:from-slate-800 dark:to-slate-950" : o.value === "system" ? "from-slate-300 via-slate-400 to-slate-950" : ""}`}
              />{" "}
              <p className="text-sm font-semibold text-dark capitalize dark:text-white">
                {o.label}
              </p>{" "}
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                {o.desc}
              </p>{" "}
            </button>
          );
        })}{" "}
      </div>{" "}
    </Card>
  );
};
/* ---------- Danger zone ---------- */ const DangerZone = ({
  onDeleted,
}: {
  onDeleted: () => Promise<void> | void;
}) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const del = useMutation({
    mutationFn: () => userService.deleteAccount(password),
    onSuccess: async () => {
      toast("Your account has been deleted.", "info");
      setOpen(false);
      await onDeleted();
      window.location.href = "/";
    },
    onError: (err) =>
      toast(getApiErrorMessage(err), "error", "Could not delete account"),
  });
  const canDelete = password.length > 0 && confirmText === "DELETE";
  return (
    <>
      {" "}
      <Card className="border-danger-200 p-6">
        {" "}
        <h3 className="flex items-center gap-2 font-semibold text-danger">
          {" "}
          <AlertTriangle className="h-4 w-4" /> Danger Zone{" "}
        </h3>{" "}
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-danger-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            {" "}
            <p className="text-sm font-medium text-dark">Delete Account</p>{" "}
            <p className="mt-0.5 text-xs text-slate-500">
              {" "}
              Permanently removes your profile, documents and history.
              Blockchain registrations remain on-chain.{" "}
            </p>{" "}
          </div>{" "}
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setOpen(true)}
          >
            {" "}
            Delete Account{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete Account — Final Confirmation"
        size="sm"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div className="rounded-xl border border-danger-100 bg-danger-100/40 p-4 text-sm text-danger">
            {" "}
            <strong>This action cannot be undone.</strong> All local documents
            will be erased and your account permanently removed.{" "}
          </div>{" "}
          <Input
            label="Confirm your password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />{" "}
          <Input
            label='Type "DELETE" to confirm'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
          />{" "}
          <div className="flex justify-end gap-2">
            {" "}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>{" "}
            <Button
              variant="danger"
              disabled={!canDelete}
              loading={del.isPending}
              onClick={() => del.mutate()}
            >
              {" "}
              Delete Forever{" "}
            </Button>{" "}
          </div>{" "}
        </div>{" "}
      </Modal>{" "}
    </>
  );
};
/* ---------- shared bits ---------- */ const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:opacity-50 ${checked ? "bg-primary-500" : "bg-slate-300"}`}
  >
    {" "}
    <span
      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-5" : ""}`}
    />{" "}
  </button>
);
const Row = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3 border-b border-slate-50 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    {" "}
    <div>
      {" "}
      <p className="text-sm font-medium text-dark">{title}</p>{" "}
      {description && (
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      )}{" "}
    </div>{" "}
    <div className="shrink-0">{children}</div>{" "}
  </div>
);
const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    {" "}
    <dt className="shrink-0 text-sm font-medium text-slate-500">
      {label}
    </dt>{" "}
    <dd className="min-w-0 break-all text-right text-sm text-dark">
      {value}
    </dd>{" "}
  </div>
);
const SkeletonBar = () => (
  <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
);
