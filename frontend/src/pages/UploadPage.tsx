import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Contract, Interface } from "ethers";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import {
  sha256File,
  validateFile,
  ACCEPTED_LABEL,
  MAX_FILE_SIZE_MB,
} from "@/utils/hash";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { documentService } from "@/services/documentService";
import { blockchainService } from "@/services/blockchainService";
import { getApiErrorMessage } from "@/services/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatBytes } from "@/utils/format";
/** Minimal ABI for the browser-side registration call. Includes the contract's * custom error so ethers can decode the revert reason. */ const ABI =
  [
    "function registerDocument(bytes32 documentHash)",
    "error AlreadyRegistered(bytes32 documentHash, address existingOwner)",
  ];
const ABI_IFACE = new Interface(ABI);
type TxStage =
  | "idle"
  | "preparing"
  | "signing"
  | "pending"
  | "confirming"
  | "confirmed"
  | "failed";
/** A registration attempt that the contract rejected on-chain. */ type RegistrationFailure =
  | { kind: "duplicate"; documentHash: string; existingOwner: string }
  | { kind: "general"; message: string };
/** Robustly detects an `AlreadyRegistered` revert regardless of how ethers *  surfaces it (CallException.revert, errorName/errorArgs, or raw revert data). */ function decodeAlreadyRegistered(
  err: unknown,
): { documentHash: string; existingOwner: string } | null {
  const e = err as {
    revert?: { name?: string; args?: unknown[] };
    errorName?: string;
    errorArgs?: unknown[];
    data?: string;
  };
  let args: unknown[] | undefined;
  if (e.revert?.name === "AlreadyRegistered" && Array.isArray(e.revert.args)) {
    args = e.revert.args;
  } else if (
    e.errorName === "AlreadyRegistered" &&
    Array.isArray(e.errorArgs)
  ) {
    args = e.errorArgs;
  }
  if (!args && e.data && e.data.toLowerCase().startsWith("0x01f95aba")) {
    try {
      const parsed = ABI_IFACE.parseError(e.data);
      if (parsed) args = parsed.args;
    } catch {
      // fall through with undefined args
    }
  }
  if (!args || args.length < 2) return null;
  return {
    documentHash: String(args[0]).toLowerCase().replace(/^0x/, ""),
    existingOwner: String(args[1]),
  };
}
const STAGES: Array<{ key: TxStage; label: string }> = [
  { key: "preparing", label: "Preparing transaction" },
  { key: "signing", label: "Signing and submitting transaction" },
  { key: "pending", label: "Transaction submitted — pending" },
  { key: "confirming", label: "Waiting for blockchain confirmation" },
  { key: "confirmed", label: "Blockchain confirmed" },
];
export const UploadPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState("");
  const [blockNumber, setBlockNumber] = useState<number | undefined>();
  const [failure, setFailure] = useState<RegistrationFailure | null>(null);
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
      setFailure(null);
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
    mutationFn: () =>
      documentService.create({
        file: file!,
        originalName: file!.name,
        fileName: file!.name,
        fileSize: file!.size,
        mimeType: file!.type || "application/octet-stream",
        sha256Hash: hash,
        transactionHash: txHash,
        blockNumber,
      }),
    onSuccess: () => {
      toast("Document registered on the blockchain successfully!", "success");
      setTimeout(() => navigate("/documents"), 1200);
    },
    onError: (err) => {
      toast(getApiErrorMessage(err), "error", "Could not save document");
      setStage("failed");
    },
  });
  const registerOnChain = async () => {
    if (!file || !hash) return;
    if (!wallet.isConnected) {
      toast("Please connect your wallet first.", "warning");
      return;
    }
    if (!wallet.contractAddress) {
      toast(
        'The smart contract is not deployed yet. Run "npm run deploy:local" in the blockchain workspace and set CONTRACT_ADDRESS in backend/.env.',
        "error",
        "Contract not configured",
      );
      return;
    }
    if (!wallet.isCorrectNetwork) {
      toast("Your wallet is connected to the wrong network.", "warning");
      await wallet.switchToExpectedNetwork();
      return;
    }
    setTxHash("");
    try {
      // 1-2: prepare + sign
      setStage("preparing");
      const signer = await wallet.getSigner(); // Guard: make sure the contract is actually deployed on the network the
      // wallet is connected to. Chain IDs are reused across networks (e.g.
      // GoChain Testnet and Hardhat Local are both 31337), so a matching chain
      // ID alone does not mean the contract exists here — without this check
      // the transaction would only fail after being broadcast.
      const deployedCode = await signer.provider?.getCode(
        wallet.contractAddress,
      );
      if (!deployedCode || deployedCode === "0x") {
        setStage("failed");
        toast(
          `The BlockVault contract (${wallet.contractAddress}) is not deployed on the connected network (${blockchainService.networkName(wallet.chainId)}, chain ID ${wallet.chainId}). Deploy it with "npm run deploy:local" and set CONTRACT_ADDRESS in backend/.env, then connect the wallet again.`,
          "error",
          "Contract not found on this network",
        );
        return;
      }
      const contract = new Contract(wallet.contractAddress, ABI, signer);
      setStage("signing");
      const bytes32 = ("0x" + hash.toLowerCase()) as `0x${string}`;
      const tx = await contract.registerDocument(bytes32); // 3: submitted
      setStage("pending");
      setTxHash(tx.hash); // 4: confirming
      setStage("confirming");
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        setStage("failed");
        toast("The transaction was reverted by the smart contract.", "error");
        return;
      } // 5: confirmed
      setBlockNumber(receipt.blockNumber);
      setStage("confirmed");
      saveDocument.mutate();
    } catch (err) {
      setStage("failed");
      const dup = decodeAlreadyRegistered(err);
      if (dup) {
        setFailure({
          kind: "duplicate",
          documentHash: dup.documentHash,
          existingOwner: dup.existingOwner,
        });
        if (dup.documentHash && dup.documentHash !== hash.toLowerCase()) {
          toast(
            `This document was previously registered with a different hash (${dup.documentHash.slice(0, 10)}…). The exact digest you uploaded is already on-chain.`,
            "error",
            "Already registered",
          );
        }
        return;
      }
      setFailure({ kind: "general", message: getApiErrorMessage(err) });
    }
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
            {ACCEPTED_LABEL} · Maximum {MAX_FILE_SIZE_MB} MB{" "}
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
                  {formatBytes(file.size)} · {file.type || "unknown type"}{" "}
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
                from file bytes…{" "}
              </p>
            ) : (
              <p className="mt-2 break-all font-mono text-xs leading-relaxed text-dark">
                {hash}
              </p>
            )}{" "}
          </div>{" "}
          {/* Wallet status */}{" "}
          {!wallet.isConnected && (
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
          {wallet.isConnected && !wallet.isCorrectNetwork && (
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
                        ? ` · ${txHash.slice(0, 10)}…${txHash.slice(-6)}`
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
                    metadata…{" "}
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
              onClick={registerOnChain}
              icon={<Fingerprint className="h-4 w-4" />}
            >
              {" "}
              Register on Blockchain{" "}
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
                      {failure.documentHash || hash || "—"}{" "}
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
                      {wallet.contractAddress || "—"}{" "}
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
                      Register a different document — every unique file produces
                      its own hash.
                    </li>{" "}
                    <li>
                      {" "}
                      This record is public and verifiable — look it up by hash
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
                      {failure.message}
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
                      {hash || "—"}{" "}
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
                      {wallet.contractAddress || "—"}{" "}
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
                      {blockchainService.networkName(wallet.chainId)} · Network ID{" "}
                      {wallet.chainId ?? "—"}{" "}
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
