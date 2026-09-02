import { Types } from 'mongoose';
import type { Request } from 'express';

export interface AuthUser {
  id: Types.ObjectId;
  fullName: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      ip2?: string;
    }
  }
}

export type BlockchainStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'MODIFIED' | 'NOT_FOUND';
export type VerificationResult = 'VERIFIED' | 'MODIFIED' | 'NOT_FOUND';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ChainRecord {
  exists: boolean;
  owner: string;
  timestamp: number;
  blockNumber: number;
}
