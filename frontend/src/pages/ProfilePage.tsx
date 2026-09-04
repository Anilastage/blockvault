import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  KeyRound,
  Copy,
  Check,
  Unplug,
  Wallet,
  ShieldCheck,
  BadgeCheck,
  Calendar,
  Clock,
  Mail,
} from "lucide-react";
import { authService } from "@/services/authService";
import { getApiErrorMessage } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RoleBadge, ActiveBadge } from "@/components/ui/Badge";
import { initials, formatDate, formatDateTime } from "@/utils/format";
const profileSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name").max(100),
});
type ProfileValues = z.infer<typeof profileSchema>;
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;
export const ProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const wallet = useWallet();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { fullName: user?.fullName ?? "" },
  });
  const pwForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const saveMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      authService.updateProfile({ fullName: values.fullName }),
    onSuccess: async () => {
      await refreshUser();
      toast("Profile updated successfully.", "success");
    },
    onError: (err) => toast(getApiErrorMessage(err), "error", "Update failed"),
  });
  const saveWalletMutation = useMutation({
    mutationFn: () => {
      const address = wallet.account ?? "";
      return authService.updateProfile({ walletAddress: address });
    },
    onSuccess: async (_data) => {
      await refreshUser();
      toast("Wallet address saved to your profile.", "success");
    },
    onError: (err) =>
      toast(getApiErrorMessage(err), "error", "Could not save wallet"),
  });
  const passwordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      authService.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast("Password changed successfully.", "success");
      setPwOpen(false);
      pwForm.reset();
    },
    onError: (err) =>
      toast(getApiErrorMessage(err), "error", "Password change failed"),
  });
  const copyAddress = async () => {
    if (!user?.walletAddress) return;
    await navigator.clipboard.writeText(user.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  if (!user) return null;
  const dirtyWallet =
    (wallet.account ?? "") !== "" &&
    user.walletAddress !== wallet.account?.toLowerCase();
  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in">
      {" "}
      <p className="-mt-2 text-sm text-slate-500">
        {" "}
        Manage your personal information and blockchain identity.{" "}
      </p>{" "}
      {/* Header card */}{" "}
      <Card className="overflow-hidden">
        {" "}
        <div className="h-24 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500" />{" "}
        <div className="-mt-10 px-6 pb-6">
          {" "}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            {" "}
            <div className="flex items-end gap-4">
              {" "}
              {user.profileImage ? (
                <img
                  src={user.profileImage}
                  alt={`${user.fullName}'s avatar`}
                  className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-md"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-primary-500 to-secondary-500 text-2xl font-bold text-white shadow-md">
                  {" "}
                  {initials(user.fullName)}{" "}
                </span>
              )}{" "}
              <div className="pb-1">
                {" "}
                <h2 className="text-xl font-bold text-dark">
                  {user.fullName}
                </h2>{" "}
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  {" "}
                  <Mail className="h-3.5 w-3.5" /> {user.email}{" "}
                </p>{" "}
              </div>{" "}
            </div>{" "}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {" "}
              <RoleBadge role={user.role} />{" "}
              <ActiveBadge isActive={user.isActive} />{" "}
              {user.isActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-600">
                  {" "}
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified User{" "}
                </span>
              )}{" "}
            </div>{" "}
          </div>{" "}
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
            {" "}
            <Meta
              icon={<Calendar className="h-4 w-4" />}
              label="Account Created"
              value={formatDate(user.createdAt)}
            />{" "}
            <Meta
              icon={<Clock className="h-4 w-4" />}
              label="Last Login"
              value={formatDateTime(user.lastLoginAt)}
            />{" "}
            <Meta
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Wallet Status"
              value={user.walletAddress ? "Linked" : "Not linked"}
            />{" "}
          </dl>{" "}
        </div>{" "}
      </Card>{" "}
      {/* Personal info */}{" "}
      <Card className="p-6">
        {" "}
        <h3 className="mb-4 font-semibold text-dark">
          Personal Information
        </h3>{" "}
        <form
          onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
          className="space-y-4"
        >
          {" "}
          <Input
            label="Full Name"
            error={form.formState.errors.fullName?.message}
            {...form.register("fullName")}
          />{" "}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {" "}
            <Input
              label="Email"
              value={user.email}
              disabled
              hint="Email cannot be changed."
            />{" "}
            <Input
              label="Role"
              value={user.role}
              disabled
              hint="Role is managed by administrators."
            />{" "}
          </div>{" "}
          <div className="flex justify-end">
            {" "}
            <Button
              type="submit"
              loading={saveMutation.isPending}
              disabled={!form.formState.isDirty}
            >
              {" "}
              Save Changes{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Card>{" "}
      {/* Wallet identity */}{" "}
      <Card className="p-6">
        {" "}
        <div className="mb-4 flex items-center justify-between">
          {" "}
          <h3 className="font-semibold text-dark">Blockchain Identity</h3>{" "}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${wallet.isConnected ? "bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success" : "bg-slate-100 text-slate-500"}`}
          >
            {" "}
            <span
              className={`h-1.5 w-1.5 rounded-full ${wallet.isConnected ? "bg-success animate-pulse-soft" : "bg-slate-400"}`}
            />{" "}
            {wallet.isConnected ? "Connected" : "Disconnected"}{" "}
          </span>{" "}
        </div>{" "}
        <dl className="space-y-3.5">
          {" "}
          <Row label="My Wallet">
            {" "}
            {user.walletAddress ? (
              <span className="flex flex-wrap items-center gap-2">
                {" "}
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs text-dark">
                  {" "}
                  {user.walletAddress.slice(0, 10)}...
                  {user.walletAddress.slice(-8)}{" "}
                </code>{" "}
                <button
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                  className="rounded p-1 text-slate-400 hover:text-primary-600"
                >
                  {" "}
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}{" "}
                </button>{" "}
              </span>
            ) : (
              <span className="text-sm text-slate-400">No wallet linked</span>
            )}{" "}
          </Row>{" "}
          <Row
            label="Network"
            value={blockchainLabel(wallet.chainId, wallet.expectedChainId)}
          />{" "}
          <Row label="Network ID" value={wallet.expectedChainId ?? "—"} />{" "}
        </dl>{" "}
        <div className="mt-5 flex flex-wrap gap-2">
          {" "}
          {!wallet.isConnected ? (
            <Button
              size="sm"
              icon={<Wallet className="h-4 w-4" />}
              loading={wallet.connecting}
              onClick={wallet.connect}
            >
              {" "}
              Connect Wallet{" "}
            </Button>
          ) : (
            <>
              {" "}
              {dirtyWallet && (
                <Button
                  size="sm"
                  variant="success"
                  loading={saveWalletMutation.isPending}
                  onClick={() => saveWalletMutation.mutate()}
                >
                  {" "}
                  Save This Address To Profile{" "}
                </Button>
              )}{" "}
              {wallet.account?.toLowerCase() === user.walletAddress &&
                !dirtyWallet && (
                  <span className="self-center text-xs font-medium text-success-600">
                    {" "}
                    Linked address matches the connected wallet.{" "}
                  </span>
                )}{" "}
              <Button
                size="sm"
                variant="outline"
                icon={<Unplug className="h-4 w-4" />}
                onClick={wallet.disconnect}
              >
                {" "}
                Disconnect{" "}
              </Button>{" "}
            </>
          )}{" "}
        </div>{" "}
      </Card>{" "}
      {/* Security */}{" "}
      <Card className="p-6">
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            {" "}
            <h3 className="font-semibold text-dark">Security</h3>{" "}
            <p className="mt-1 text-sm text-slate-500">
              {" "}
              Passwords are hashed with bcrypt — they can be changed but never
              recovered.{" "}
            </p>{" "}
          </div>{" "}
          <Button
            variant="outline"
            icon={<KeyRound className="h-4 w-4" />}
            onClick={() => setPwOpen(true)}
          >
            {" "}
            Change Password{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      {/* Change password modal */}{" "}
      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change Password"
      >
        {" "}
        <form
          onSubmit={pwForm.handleSubmit((v) => passwordMutation.mutate(v))}
          className="space-y-4"
          noValidate
        >
          {" "}
          <Input
            label="Current Password"
            type="password"
            autoComplete="current-password"
            {...pwForm.register("currentPassword")}
            error={pwForm.formState.errors.currentPassword?.message}
          />{" "}
          <Input
            label="New Password"
            type="password"
            autoComplete="new-password"
            {...pwForm.register("newPassword")}
            error={pwForm.formState.errors.newPassword?.message}
            hint="Minimum 8 characters."
          />{" "}
          <Input
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            {...pwForm.register("confirmPassword")}
            error={pwForm.formState.errors.confirmPassword?.message}
          />{" "}
          <div className="flex justify-end gap-2 pt-1">
            {" "}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPwOpen(false)}
            >
              {" "}
              Cancel{" "}
            </Button>{" "}
            <Button type="submit" loading={passwordMutation.isPending}>
              {" "}
              Update Password{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Modal>{" "}
    </div>
  );
};
const blockchainLabel = (
  chainId: number | null,
  expected: number | null,
): string => {
  if (chainId == null)
    return expected != null ? `Configured network (Network ID ${expected})` : "—";
  return blockchainName(chainId);
};
const blockchainName = (chainId: number): string => {
  const known: Record<number, string> = {
    1: "Ethereum Mainnet",
    11155111: "Sepolia Testnet",
    84532: "Base Sepolia",
    31337: "Hardhat Local",
    1337: "Local Geth",
  };
  return known[chainId] ?? `Custom Network (${chainId})`;
};
const Meta = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="flex items-center gap-3">
    {" "}
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
      {" "}
      {icon}{" "}
    </span>{" "}
    <div>
      {" "}
      <dt className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </dt>{" "}
      <dd className="text-sm font-medium text-dark">{value}</dd>{" "}
    </div>{" "}
  </div>
);
const Row = ({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    {" "}
    <dt className="shrink-0 text-sm font-medium text-slate-500">
      {label}
    </dt>{" "}
    <dd className="min-w-0 break-all text-right text-sm text-dark">
      {children ?? value}
    </dd>{" "}
  </div>
);
