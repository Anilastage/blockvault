import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  UploadCloud,
  FileText,
  X,
  Fingerprint,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Zap,
  GitBranch,
} from "lucide-react";
import {
  sha256File,
  validateFile,
  ACCEPTED_LABEL,
  MAX_FILE_SIZE_MB,
} from "@/utils/hash";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { useVault } from "@/context/VaultContext";
import { documentService } from "@/services/documentService";
import { blockchainService } from "@/services/blockchainService";
import { getApiErrorMessage } from "@/services/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Feedback";
import { formatBytes } from "@/utils/format";
import { encryptFileBytes, randomBytes, sha256Hex, wrapWithAesKey } from "@/utils/crypto";
import {
  registerHashOnChain,
  isRegisterFailure,
  failureMessage,
  type RegisterFailure,
  type RegisterStage,
} from "@/utils/blockchainRegistration";

type TxStage = "idle" | RegisterStage | "confirmed" | "failed";
const STAGES: Array<{ key: TxStage; label: string }> = [
  { key: "preparing", label: "Preparing transaction" },
  { key: "signing", label: "Signing and submitting transaction" },
  { key: "pending", label: "Transaction submitted â€” pending" },
  { key: "confirming", label: "Waiting for blockchain confirmation" },
  { key: "confirmed", label: "Blockchain confirmed" },
];
export const UploadPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const vault = useVault();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parent") ?? undefined;
  const parentQuery = useQuery({
    queryKey: ["document", parentId],
    queryFn: () => documentService.get(parentId!),
    enabled: !!parentId,
  });
  const parent = parentQuery.data;
  const nextVersion = (parent?.version ?? 1) + 1;
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [autoRegister, setAutoRegister] = useState(true);
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState("");
  const [blockNumber, setBlockNumber] = useState<number | undefined>();
  const [failure, setFailure] = useState<RegisterFailure | null>(null);
  const selectFile = useCallback(
    async (selected: File | null | undefined) => {
      if (!selected) return;
      const error = validateFile(selected);
      if (error) {
        toast(error, "error");
        return;
      }
      setFile(selected);
      setHash("");
      setStage("idle");
      setTxHash("");
      setBlockNumber(undefined);
      setFailure(null);
      setAutoRegister(true);
      setHashing(true);
      try {
        const digest = await sha256File(selected);
        setHash(digest);
      } catch {
        toast("Could not compute the SHA-256 hash of this file.", "error");
        setFile(null);
      } finally {
        setHashing(false);
      }
    },
    [toast],
  );
  const saveDocument = useMutation({
    mutationFn: async ({
      transactionHash,
      blockNumber: txBlockNumber,
    }: {
      transactionHash?: string;
      blockNumber?: number;
    }) => {
      if (!file || !hash) throw new Error("Select a document first.");
      const vaultKeyRaw = await vault.ensureUnlocked();
      const dekRaw = randomBytes(32);
      const plaintext = new Uint8Array(await file.arrayBuffer());
      const { ciphertext, iv } = await encryptFileBytes(plaintext, dekRaw);
      const wrappedKey = await wrapWithAesKey(dekRaw, vaultKeyRaw);
      const ciphertextHash = await sha256Hex(ciphertext);
      const ciphertextBuffer = ciphertext.buffer.slice(
        ciphertext.byteOffset,
        ciphertext.byteOffset + ciphertext.byteLength
      ) as ArrayBuffer;
      const encryptedFile = new File([ciphertextBuffer], file.name, {
        type: file.type || "application/octet-stream",
        lastModified: file.lastModified,
      });

      return documentService.create({
        file: encryptedFile,
        originalName: file.name,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        sha256Hash: hash,
        transactionHash,
        blockNumber: txBlockNumber,
        parentId,
        encryption: {
          iv,
          wrappedKey: wrappedKey.data,
          keyIv: wrappedKey.iv,
          ciphertextHash,
          ciphertextSize: ciphertext.byteLength,
        },
      });
    },
    onSuccess: (data, variables) => {
      toast(
        variables.transactionHash
          ? parentId
            ? `Version ${nextVersion} registered on the blockchain successfully!`
            : "Document registered on the blockchain successfully!"
          : parentId
            ? `Version ${nextVersion} uploaded. Register it on the blockchain whenever you're ready.`
            : "Document uploaded. Register it on the blockchain whenever you're ready.",
        "success"
      );
      setTimeout(() => navigate(parentId ? `/documents/${data._id}` : "/documents"), 1200);
    },
    onError: (err) => {
      toast(getApiErrorMessage(err), "error", "Could not save document");
      setStage("failed");
    },
  });
  const registerOnChain = async () => {
    if (!file || !hash) return;
    setTxHash("");
    try {
      const { transactionHash, blockNumber: block } = await registerHashOnChain(
        wallet,
        { hash, originalName: file.name },
        (s) => setStage(s)
      );
      setTxHash(transactionHash);
      setBlockNumber(block);
      setStage("confirmed");
      saveDocument.mutate({ transactionHash, blockNumber: block });
    } catch (err) {
      setStage("failed");
      if (!isRegisterFailure(err)) {
        setFailure({ kind: "general", message: getApiErrorMessage(err) });
        toast(getApiErrorMessage(err), "error", "Registration failed");
        return;
      }
      if (err.kind === "duplicate") {
        setFailure(err);
        if (err.documentHash && err.documentHash !== hash.toLowerCase()) {
          toast(
            `This document was previously registered with a different hash (${err.documentHash.slice(0, 10)}â€¦). The exact digest you uploaded is already on-chain.`,
            "error",
            "Already registered"
          );
        }
        return;
      }
      if (err.kind === "network") {
        toast("Your wallet is connected to the wrong network.", "warning");
        setStage("idle");
        void wallet.switchToExpectedNetwork();
        return;
      }
      setFailure(err);
      if (err.kind === "contract") toast(err.message, "error", "Contract not configured");
      else toast(err.message, "error", "Registration failed");
    }
  };
  const uploadOnly = () => {
    if (!file || !hash) return;
    saveDocument.mutate({ transactionHash: undefined, blockNumber: undefined });
  };
  const submit = async () => {
    if (!file || !hash) return;
    try {
      await vault.ensureUnlocked();
    } catch {
      toast(
        "Unlock your encryption vault before uploading so the document can be encrypted.",
        "warning",
        "Vault locked"
      );
      return;
    }
    if (autoRegister) void registerOnChain();
    else uploadOnly();
  };
  const busy =
    stage === "preparing" ||
    stage === "signing" ||
    stage === "pending" ||
    stage === "confirming";
  const activeStageIndex = STAGES.findIndex((s) => s.key === stage);
  const explorerUrl = txHash
    ? blockchainService.explorerTxUrl(wallet.explorerUrl, txHash)
    : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {" "}
      {parentId &&
        (parentQuery.isLoading ? (
          <Card className="flex items-center gap-3 p-5">
            {" "}
            <Spinner className="h-4 w-4" /> Loading document being revisedâ€¦
          </Card>
        ) : parent && parent.blockchainStatus === "CONFIRMED" ? (
          <Card className="border-secondary-200 bg-secondary-100/30 p-5">
            {" "}
            <div className="flex items-start gap-3">
              {" "}
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-500/10">
                {" "}
                <GitBranch className="h-4 w-4 text-secondary-500" />{" "}
              </span>{" "}
              <div className="min-w-0 text-sm">
                {" "}
                <p className="font-semibold text-dark">
                  Uploading a new version of {parent.originalName}
                </p>{" "}
                <p className="mt-1 text-xs text-slate-600">
                  This file will be saved as version {nextVersion}. The current
                  version ({parent.version ?? 1}) stays on-chain, so the full
                  history of this document family remains verifiable.{" "}
                </p>{" "}
              </div>{" "}
            </div>{" "}
          </Card>
        ) : (
          <Card className="flex items-start gap-3 border-danger-100 bg-danger-100/40 p-5">
            {" "}
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />{" "}
            <p className="text-sm text-slate-600">
              The document being revised could not be found or is not yet
              registered on the blockchain. Register it first, then upload a new
              version.{" "}
              <button
                onClick={() => navigate("/documents")}
                className="font-medium text-primary-600 underline underline-offset-2"
              >
                Back to Documents
              </button>
            </p>{" "}
          </Card>
        ))}
      {/* Drop zone */}{" "}
      <Card className="overflow-hidden">
        {" "}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            selectFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center px-6 py-14 text-center transition-all duration-200 ${dragOver ? "bg-primary-50 ring-2 ring-primary-300 ring-inset" : "hover:bg-slate-50"}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          aria-label="Upload a document"
        >
          {" "}
          <div
            className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-lg shadow-primary-500/25 transition-transform duration-200 ${dragOver ? "scale-110 rotate-3" : ""}`}
          >
            {" "}
            <UploadCloud className="h-8 w-8 text-white" />{" "}
          </div>{" "}
          <p className="text-base font-semibold text-dark">
            Drag & drop your document
          </p>{" "}
          <p className="mt-1 text-sm text-slate-500">
            {" "}
            or{" "}
            <span className="font-semibold text-primary-600 underline underline-offset-2">
              {" "}
              browse files{" "}
            </span>{" "}
          </p>{" "}
          <p className="mt-4 rounded-full bg-slate-100 px-4 py-1 text-xs font-medium text-slate-500">
            {" "}
            {ACCEPTED_LABEL} Â· Maximum {MAX_FILE_SIZE_MB} MB{" "}
          </p>{" "}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => selectFile(e.target.files?.[0])}
            disabled={busy}
          />{" "}
        </div>{" "}
      </Card>{" "}
      {/* Selected file details */}{" "}
      {file && (
        <Card className="animate-fade-in p-5">
          {" "}
          <div className="flex items-start justify-between gap-3">
            {" "}
            <div className="flex min-w-0 items-center gap-3">
              {" "}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                {" "}
                <FileText className="h-5 w-5 text-primary-500" />{" "}
              </span>{" "}
              <div className="min-w-0">
                {" "}
                <p className="truncate font-semibold text-dark">
                  {file.name}
                </p>{" "}
                <p className="text-xs text-slate-400">
                  {" "}
                  {formatBytes(file.size)} Â· {file.type || "unknown type"}{" "}
                </p>{" "}
              </div>{" "}
            </div>{" "}
            {!busy && (
              <button
                onClick={() => {
                  setFile(null);
                  setHash("");
                  setStage("idle");
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Remove file"
              >
                {" "}
                <X className="h-4 w-4" />{" "}
              </button>
            )}{" "}
          </div>{" "}
          {/* Hash */}{" "}
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            {" "}
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {" "}
              <Fingerprint className="h-3.5 w-3.5" /> Document Fingerprint{" "}
            </p>{" "}
            {hashing ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                {" "}
                <Loader2 className="h-4 w-4 animate-spin" /> Computing digest
                from file bytesâ€¦{" "}
              </p>
            ) : (
              <p className="mt-2 break-all font-mono text-xs leading-relaxed text-dark">
                {hash}
              </p>
            )}{" "}
          </div>{" "}
          {/* Auto-register toggle */}{" "}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            {" "}
            <div className="flex min-w-0 items-start gap-3">
              {" "}
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                {" "}
                <Zap className="h-4 w-4 text-primary-500" />{" "}
              </span>{" "}
              <div className="min-w-0">
                {" "}
                <p className="text-sm font-semibold text-dark">
                  Register on blockchain after upload{" "}
                </p>{" "}
                <p className="mt-0.5 text-xs text-slate-500">
                  {" "}
                  {autoRegister
                    ? "Your wallet will sign a transaction that anchors this document's fingerprint on-chain."
                    : "The document is saved as Pending. You can register it on-chain later from the Documents page."}{" "}
                </p>{" "}
              </div>{" "}
            </div>{" "}
            <button
              type="button"
              role="switch"
              aria-checked={autoRegister}
              disabled={busy || saveDocument.isPending}
              onClick={() => setAutoRegister((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${autoRegister ? "bg-primary-500" : "bg-slate-300"}`}
            >
              {" "}
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${autoRegister ? "left-[22px]" : "left-0.5"}`}
              />{" "}
            </button>{" "}
          </div>{" "}
          {/* Wallet status */}{" "}
          {autoRegister && !wallet.isConnected && (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-warning-100 bg-warning-100/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              {" "}
              <div className="flex items-start gap-2.5">
                {" "}
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />{" "}
                <p className="text-sm text-slate-600">
                  {" "}
                  Connect your wallet to register this document on the
                  blockchain.{" "}
                </p>{" "}
              </div>{" "}
              <Button
                size="sm"
                icon={<Wallet className="h-4 w-4" />}
                onClick={wallet.connect}
                loading={wallet.connecting}
              >
                {" "}
                Connect Wallet{" "}
              </Button>{" "}
            </div>
          )}{" "}
          {autoRegister && wallet.isConnected && !wallet.isCorrectNetwork && (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-danger-100 bg-danger-100/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              {" "}
              <div className="flex items-start gap-2.5">
                {" "}
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />{" "}
                <p className="text-sm text-slate-600">
                  {" "}
                  Your wallet is on the wrong network (chain ID {wallet.chainId}
                  ). Expected chain ID: {wallet.expectedChainId}.{" "}
                </p>{" "}
              </div>{" "}
              <Button
                size="sm"
                variant="outline"
                onClick={wallet.switchToExpectedNetwork}
              >
                {" "}
                Switch Network{" "}
              </Button>{" "}
            </div>
          )}{" "}
          {/* Transaction progress */}{" "}
          {(busy || stage === "confirmed" || stage === "failed") && (
            <ol className="mt-4 space-y-2.5 rounded-xl border border-slate-100 p-4">
              {" "}
              {STAGES.map((s, i) => {
                const done = activeStageIndex > i || stage === "confirmed";
                const active = s.key === stage && stage !== "confirmed";
                return (
                  <li key={s.key} className="flex items-center gap-3 text-sm">
                    {" "}
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                    ) : stage === "failed" && i === activeStageIndex ? (
                      <X className="h-4 w-4 text-danger" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
                    )}{" "}
                    <span
                      className={
                        done
                          ? "text-slate-500 line-through decoration-slate-300"
                          : active
                            ? "font-medium text-primary-600 animate-pulse-soft"
                            : "text-slate-400"
                      }
                    >
                      {" "}
                      {s.label}{" "}
                      {s.key === "pending" && txHash
                        ? ` Â· ${txHash.slice(0, 10)}â€¦${txHash.slice(-6)}`
                        : ""}{" "}
                    </span>{" "}
                  </li>
                );
              })}{" "}
            </ol>
          )}{" "}
          {/* Success banner */}{" "}
          {stage === "confirmed" && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-success-100 bg-success-100/40 p-4">
              {" "}
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />{" "}
              <div className="min-w-0 text-sm">
                {" "}
                <p className="font-semibold text-success-600">
                  Registered on-chain!
                </p>{" "}
                <p className="break-all text-xs text-slate-500">
                  Block #{blockNumber}
                </p>{" "}
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    {" "}
                    View on Blockchain Explorer{" "}
                    <ExternalLink className="h-3 w-3" />{" "}
                  </a>
                )}{" "}
                {saveDocument.isPending && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    {" "}
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving document
                    metadataâ€¦{" "}
                  </p>
                )}{" "}
              </div>{" "}
            </div>
          )}{" "}
          {/* CTA */}{" "}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {" "}
            <Link to="/documents">
              {" "}
              <Button variant="ghost">Cancel</Button>{" "}
            </Link>{" "}
            <Button
              size="lg"
              disabled={
                !file || hashing || !hash || busy || stage === "confirmed"
              }
              loading={saveDocument.isPending}
              onClick={submit}
              icon={autoRegister ? <Fingerprint className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
            >
              {" "}
              {autoRegister ? "Register on Blockchain" : "Upload Document"}{" "}
            </Button>{" "}
          </div>{" "}
        </Card>
      )}{" "}
      {/* Info card */}{" "}
      <Card className="border-dashed bg-slate-50/60 p-5">
        {" "}
        <h3 className="flex items-center gap-2 text-sm font-semibold text-dark">
          {" "}
          <ShieldIcon /> How registration works{" "}
        </h3>{" "}
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-500">
          {" "}
          <li>
            Your browser computes the digital fingerprint of the raw file bytes.
          </li>{" "}
          <li>
            The built-in demo wallet signs a transaction that stores only that
            hash on-chain.
          </li>{" "}
          <li>
            The server independently verifies the transaction before saving
            metadata.
          </li>{" "}
          <li>
            The document file itself is never stored on the blockchain.
          </li>{" "}
        </ol>{" "}
      </Card>{" "}
      {/* Registration failure detail modal */}{" "}
      <Modal
        open={!!failure}
        onClose={() => setFailure(null)}
        title="Registration Failed"
        size="lg"
      >
        {" "}
        {failure && (
          <div>
            {" "}
            {failure.kind === "duplicate" ? (
              <>
                {" "}
                <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-100/40 p-4">
                  {" "}
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />{" "}
                  <div>
                    {" "}
                    <p className="font-semibold text-danger">
                      {" "}
                      This document is already registered on the
                      blockchain.{" "}
                    </p>{" "}
                    <p className="mt-1 text-sm text-slate-600">
                      {" "}
                      Every digital fingerprint can be anchored on-chain only once. The
                      smart contract rejected this registration because an
                      identical record already exists.{" "}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <dl className="mt-4 space-y-3">
                  {" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Document Fingerprint{" "}
                    </dt>{" "}
                    <dd className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-dark">
                      {" "}
                      {failure.documentHash || hash || "â€”"}{" "}
                    </dd>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Registered by (wallet){" "}
                    </dt>{" "}
                    <dd className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-dark">
                      {" "}
                      {failure.existingOwner}{" "}
                    </dd>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Contract{" "}
                    </dt>{" "}
                    <dd className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-dark">
                      {" "}
                      {wallet.contractAddress || "â€”"}{" "}
                    </dd>{" "}
                  </div>{" "}
                </dl>{" "}
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  {" "}
                  <p className="font-semibold text-dark">
                    What you can do
                  </p>{" "}
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    {" "}
                    <li>
                      Register a different document â€” every unique file produces
                      its own hash.
                    </li>{" "}
                    <li>
                      {" "}
                      This record is public and verifiable â€” look it up by hash
                      on the Verify page or in the Blockchain Explorer.{" "}
                    </li>{" "}
                  </ul>{" "}
                </div>{" "}
              </>
            ) : (
              <>
                {" "}
                <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-100/40 p-4">
                  {" "}
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />{" "}
                  <div>
                    {" "}
                    <p className="font-semibold text-danger">
                      The transaction could not be submitted.
                    </p>{" "}
                    <p className="mt-1 text-sm text-slate-600">
                      {failureMessage(failure)}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <dl className="mt-4 space-y-3">
                  {" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Document Fingerprint{" "}
                    </dt>{" "}
                    <dd className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-dark">
                      {" "}
                      {hash || "â€”"}{" "}
                    </dd>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Contract{" "}
                    </dt>{" "}
                    <dd className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-dark">
                      {" "}
                      {wallet.contractAddress || "â€”"}{" "}
                    </dd>{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {" "}
                      Network{" "}
                    </dt>{" "}
                    <dd className="mt-1 text-sm text-dark">
                      {" "}
                      {blockchainService.networkName(wallet.chainId)} Â· Network ID{" "}
                      {wallet.chainId ?? "â€”"}{" "}
                    </dd>{" "}
                  </div>{" "}
                </dl>{" "}
              </>
            )}{" "}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {" "}
              <Button
                size="lg"
                onClick={() => setFailure(null)}
                icon={<X className="h-4 w-4" />}
              >
                {" "}
                Got it{" "}
              </Button>{" "}
            </div>{" "}
          </div>
        )}{" "}
      </Modal>{" "}
    </div>
  );
};
const ShieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 text-primary-500"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    {" "}
    <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />{" "}
  </svg>
);

