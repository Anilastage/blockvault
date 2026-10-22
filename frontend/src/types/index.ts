export type UserRole = 'USER' | 'ADMIN';

export type MfaMethod = 'totp' | 'email_otp' | 'sms_otp';

export interface VaultBundle {
  version: number;
  publicKey: string;
  encryptedPrivateKey: string;
  privateKeyIv: string;
  passwordWrappedVaultKey: string;
  passwordWrapIv: string;
  recoveryWrappedVaultKey: string;
  recoveryWrapIv: string;
  keySalt: string;
  keyIterations: number;
}

export interface VaultPasswordEnvelope {
  passwordWrappedVaultKey: string;
  passwordWrapIv: string;
  keySalt: string;
  keyIterations: number;
}

export interface VaultRecoveryStart {
  recoveryToken: string;
  email: string;
  /** False for accounts that never created an encryption vault. */
  hasVault: boolean;
  recoveryWrappedVaultKey?: string;
  recoveryWrapIv?: string;
  devCode?: string;
}

export interface User {
  id: string;
  _id?: string;
  fullName: string;
  email: string;
  role: UserRole;
  walletAddress: string;
  profileImage: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  twoFactorEnabled: boolean;
  mfaMethod?: MfaMethod;
  phoneNumber?: string;
  encryption?: { version: number; publicKey?: string } | null;
}

export interface TwoFactorSetup {
  otpauthUrl: string;
  secret: string;
  label: string;
  qrDataUrl: string;
  recoveryCodes: string[];
}

export type BlockchainStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'MODIFIED' | 'NOT_FOUND';
export type VerificationResult = 'VERIFIED' | 'MODIFIED' | 'NOT_FOUND';

export interface DocumentEncryptionInfo {
  version: number;
  algorithm: string;
  iv: string;
  wrappedKey: string;
  keyIv: string;
  plaintextHash: string;
  ciphertextHash: string;
  ciphertextSize: number;
  shareKeyWrapped?: string;
  shareKeyWrapIv?: string;
  shareDekWrapped?: string;
  shareDekIv?: string;
}

export interface DocumentItem {
  _id: string;
  encryption?: DocumentEncryptionInfo | null;
  userId: { _id: string; fullName: string; email: string } | string;
  originalName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256Hash: string;
  blockchainHash?: string;
  transactionHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  chainId?: number;
  uploadedAt: string;
  blockchainStatus: BlockchainStatus;
  verificationStatus: VerificationStatus;
  familyId?: string;
  version?: number;
  previousVersionId?: string;
  previousVersionHash?: string;
  folderId?: string | null;
  tags?: string[];
}

export interface Folder {
  _id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface DocumentVersion {
  document: DocumentItem;
  version: number;
  isCurrent: boolean;
  isSuperseded: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  pagination: Pagination;
}

export interface ChainRecord {
  exists: boolean;
  owner: string;
  timestamp: number;
  blockNumber: number;
  transactionHash?: string;
}

export interface VerifyOutcome {
  result: VerificationResult;
  calculatedHash: string;
  blockchainHash?: string;
  chain: {
    exists: boolean;
    owner: string;
    timestamp: number;
    blockNumber: number;
    transactionHash?: string;
  };
  document?: {
    id: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    ownerName: string;
    ownedByMe: boolean;
  };
}

export interface VerificationRecord {
  _id: string;
  documentId?: { _id: string; originalName: string } | null;
  userId: string;
  calculatedHash: string;
  blockchainHash?: string;
  result: VerificationResult;
  transactionHash?: string;
  blockNumber?: number;
  ownerWallet?: string;
  registeredAt?: string;
  verifiedAt: string;
  ipAddress?: string;
}

export interface ActivityLogItem {
  _id: string;
  userId?: { _id: string; fullName: string; email: string; role: UserRole } | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalDocuments: number;
  yourDocuments: number;
  verifiedDocuments: number;
  pendingTransactions: number;
  verificationAttempts: number;
}

export interface TimelinePoint {
  date: string;
  uploads: number;
  verifications: number;
  transactions: number;
}

export interface DashboardAnalytics {
  timeline: TimelinePoint[];
  verificationResults: Array<{ name: string; value: number }>;
  transactions: { total: number; confirmed: number };
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  totalVerifications: number;
  blockchainTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
}

export interface AdminUserDetail {
  user: User;
  stats: {
    totalDocuments: number;
    confirmed: number;
    pending: number;
    encrypted: number;
    verifications: number;
  };
}

export interface AdminAnalytics {
  stats: AdminStats;
  timeline: Array<{ date: string; users: number; uploads: number; verifications: number }>;
  documentIntegrity: Array<{ name: string; value: number }>;
  recentActivity: ActivityLogItem[];
}

export interface BlockchainConfig {
  contractAddress: string;
  chainId: number;
  rpcUrl?: string;
  explorerUrl: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: string[];
}

export interface BlockchainStatusInfo {
  networkName: string;
  chainId: number;
  contractAddress: string;
  explorerUrl: string | null;
  configured: boolean;
  rpcHealthy: boolean;
  onChainTotalDocuments: number | null;
  verifiedDocuments: number;
}

export interface TxRecord {
  _id: string;
  documentName: string;
  sha256Hash: string;
  transactionHash?: string | null;
  walletAddress?: string;
  blockNumber?: number | null;
  blockchainStatus: BlockchainStatus;
  uploadedAt: string;
}

export interface UserSettings {
  general: { language: string; timezone: string; dateFormat: string };
  notifications: {
    emailNotifications: boolean;
    verificationAlerts: boolean;
    transactionAlerts: boolean;
    securityAlerts: boolean;
    systemUpdates: boolean;
  };
  appearance: { theme: 'light' | 'dark' | 'system' };
}

export interface AnalyticsOverview {
  totalDocuments: number;
  totalVerifications: number;
  verificationSuccessRate: number;
  blockchainRegistrations: number;
  blockchainDocumentCount: number;
}

export interface DocumentsAnalytics {
  daily: Array<{ date: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
}

export interface VerificationsAnalytics {
  results: Array<{ name: string; value: number }>;
  daily: Array<{ date: string; count: number }>;
}

export interface BlockchainAnalytics {
  daily: Array<{
    date: string;
    transactions: number;
    confirmed: number;
    failed: number;
    pending: number;
  }>;
  totals: { confirmed: number; failed: number; pending: number };
}

export type NotificationType =
  | 'DOCUMENT_VERIFIED'
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_DENIED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCUMENT_DELETED';

export interface AppNotification {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export type NotificationListResponse = {
  notifications: AppNotification[];
  pagination: Pagination;
};

export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'USED';

export interface AccessRequestItem {
  _id: string;
  documentId:
    | {
        _id: string;
        originalName: string;
        fileSize?: number;
        mimeType?: string;
        userId?: { _id: string; fullName?: string };
        encryption?: DocumentEncryptionInfo | null;
      }
    | string;
  requesterId:
    | {
        _id: string;
        fullName: string;
        email: string;
        encryption?: { publicKey?: string } | null;
      }
    | string;
  reason?: string;
  status: AccessRequestStatus;
  accessToken?: string;
  expiresAt?: string;
  usedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type DownloadMethod = 'OWNER' | 'ADMIN' | 'ACCESS_GRANT' | 'SHARE_CODE';

export interface DownloadCodeInfo {
  code: string;
  expiresAt: string;
  secondsLeft: number;
}

export interface DownloadRecordItem {
  _id: string;
  documentId: string;
  requesterId?: { _id: string; fullName: string; email: string } | null;
  method: DownloadMethod;
  requestId?: { _id: string; status: string } | null;
  ipAddress?: string;
  downloadedAt: string;
}
