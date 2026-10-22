import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { vaultService } from '@/services/vaultService';
import {
  base64ToBytes,
  bytesToBase64,
  createPasswordEnvelope,
  createRecoveryEnvelope,
  createVault,
  importPrivateKey,
  randomBytes,
  unlockVaultWithPassword,
} from '@/utils/crypto';
import { setVaultAccessor } from '@/utils/vaultStore';
import { UnlockVaultModal } from '@/components/vault/UnlockVaultModal';
import { RecoveryPhraseModal } from '@/components/vault/RecoveryPhraseModal';

interface VaultContextValue {
  unlocked: boolean;
  userHasVault: boolean | null;
  unlockOrCreate: (password: string, userId?: string) => Promise<void>;
  unlock: (password: string, userId?: string) => Promise<void>;
  lock: () => void;
  ensureUnlocked: () => Promise<Uint8Array>;
  getVaultKeyRaw: () => Promise<Uint8Array>;
  getPrivateKey: () => Promise<CryptoKey>;
  regenerateRecoveryPhrase: () => Promise<string>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  recoveryPhrase: string | null;
  dismissRecoveryPhrase: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const sessionKey = (userId: string) => `blockvault_vault_${userId}`;

interface SessionVault {
  vaultKey: string;
  privateKey: string;
}

const readSession = (userId: string): SessionVault | null => {
  try {
    const raw = sessionStorage.getItem(sessionKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionVault;
    return parsed.vaultKey && parsed.privateKey ? parsed : null;
  } catch {
    return null;
  }
};

export const VaultProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [userHasVault, setUserHasVault] = useState<boolean | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);

  const vaultKeyRef = useRef<Uint8Array | null>(null);
  const privateKeyPkcs8Ref = useRef<ArrayBuffer | null>(null);
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const pendingRef = useRef<
    Array<{ resolve: (key: Uint8Array) => void; reject: (err: Error) => void }>
  >([]);

  const clearLocal = useCallback(() => {
    if (activeUserIdRef.current) {
      sessionStorage.removeItem(sessionKey(activeUserIdRef.current));
    }
    vaultKeyRef.current = null;
    privateKeyPkcs8Ref.current = null;
    privateKeyRef.current = null;
    setUnlocked(false);
  }, []);

  const applySession = useCallback(
    (vaultKeyRaw: Uint8Array, privateKeyPkcs8: ArrayBuffer, userId: string) => {
      activeUserIdRef.current = userId;
      vaultKeyRef.current = vaultKeyRaw;
      privateKeyPkcs8Ref.current = privateKeyPkcs8;
      privateKeyRef.current = null;
      setUnlocked(true);
      setUnlockOpen(false);
      sessionStorage.setItem(
        sessionKey(userId),
        JSON.stringify({
          vaultKey: bytesToBase64(vaultKeyRaw),
          privateKey: bytesToBase64(new Uint8Array(privateKeyPkcs8)),
        } satisfies SessionVault)
      );
      const queue = pendingRef.current;
      pendingRef.current = [];
      for (const waiter of queue) waiter.resolve(vaultKeyRaw);
    },
    []
  );

  const failPending = useCallback((message: string) => {
    const queue = pendingRef.current;
    pendingRef.current = [];
    for (const waiter of queue) waiter.reject(new Error(message));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      clearLocal();
      activeUserIdRef.current = null;
      setUserHasVault(null);
      setRecoveryPhrase(null);
      return;
    }

    if (activeUserIdRef.current !== user.id) {
      clearLocal();
      activeUserIdRef.current = user.id;
    }

    if (!vaultKeyRef.current) {
      const restored = readSession(user.id);
      if (restored) {
        try {
          const vaultKey = base64ToBytes(restored.vaultKey);
          const privateKey = base64ToBytes(restored.privateKey);
          vaultKeyRef.current = vaultKey;
          privateKeyPkcs8Ref.current = privateKey.buffer.slice(
            privateKey.byteOffset,
            privateKey.byteOffset + privateKey.byteLength
          ) as ArrayBuffer;
          setUnlocked(true);
        } catch {
          sessionStorage.removeItem(sessionKey(user.id));
        }
      }
    }

    vaultService
      .get()
      .then((bundle) => setUserHasVault(!!bundle))
      .catch(() => setUserHasVault(null));
  }, [user?.id, clearLocal]);

  const unlock = useCallback(
    async (password: string, userId?: string) => {
      const id = userId ?? user?.id;
      if (!id) throw new Error('Sign in to unlock your encryption vault.');
      const bundle = await vaultService.get();
      if (!bundle) {
        const created = await createVault(password);
        await vaultService.setup(created.bundle);
        applySession(created.vaultKeyRaw, created.privateKeyPkcs8, id);
        setUserHasVault(true);
        setRecoveryPhrase(created.recoveryPhrase);
        return;
      }

      const opened = await unlockVaultWithPassword(bundle, password);
      applySession(opened.vaultKeyRaw, opened.privateKeyPkcs8, id);
      setUserHasVault(true);
    },
    [applySession, user?.id]
  );

  const unlockOrCreate = useCallback(
    async (password: string, userId?: string) => {
      const id = userId ?? user?.id;
      if (!id) return;
      if (vaultKeyRef.current) return;
      activeUserIdRef.current = id;
      try {
        await unlock(password, id);
      } catch (err) {
        // Never block sign-in on vault issues; the user can open the vault
        // prompt manually (e.g. after changing their password elsewhere).
        setUnlockOpen(true);
        throw err;
      }
    },
    [user?.id, unlock]
  );

  const lock = useCallback(() => {
    failPending('Vault locked.');
    clearLocal();
  }, [failPending, clearLocal]);

  const ensureUnlocked = useCallback(async (): Promise<Uint8Array> => {
    if (vaultKeyRef.current) return vaultKeyRef.current;
    if (!user?.id) throw new Error('Sign in to unlock your encryption vault.');
    setUnlockOpen(true);
    return new Promise<Uint8Array>((resolve, reject) => {
      pendingRef.current.push({ resolve, reject });
    });
  }, [user?.id]);

  const getVaultKeyRaw = useCallback(async () => ensureUnlocked(), [ensureUnlocked]);

  const getPrivateKey = useCallback(async (): Promise<CryptoKey> => {
    if (privateKeyRef.current) return privateKeyRef.current;
    if (!privateKeyPkcs8Ref.current) {
      await ensureUnlocked();
    }
    if (!privateKeyPkcs8Ref.current) {
      throw new Error('Your encryption identity is not available. Unlock your vault again.');
    }
    const key = await importPrivateKey(privateKeyPkcs8Ref.current);
    privateKeyRef.current = key;
    return key;
  }, [ensureUnlocked]);

  const regenerateRecoveryPhrase = useCallback(async () => {
    const vaultKeyRaw = await ensureUnlocked();
    const recovery = await createRecoveryEnvelope(vaultKeyRaw, randomBytes(32));
    await vaultService.updateRecovery({
      recoveryWrappedVaultKey: recovery.data,
      recoveryWrapIv: recovery.iv,
    });
    setRecoveryPhrase(recovery.recoveryPhrase);
    return recovery.recoveryPhrase;
  }, [ensureUnlocked]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const vaultKeyRaw = await ensureUnlocked();
      const envelope = await createPasswordEnvelope(vaultKeyRaw, newPassword);
      await authService.changePassword(currentPassword, newPassword, envelope);
    },
    [ensureUnlocked]
  );

  useEffect(() => {
    setVaultAccessor({ getVaultKeyRaw, getPrivateKey });
    return () => setVaultAccessor(null);
  }, [getVaultKeyRaw, getPrivateKey]);

  const dismissRecoveryPhrase = useCallback(() => setRecoveryPhrase(null), []);

  const value = useMemo(
    () => ({
      unlocked,
      userHasVault,
      unlockOrCreate,
      unlock,
      lock,
      ensureUnlocked,
      getVaultKeyRaw,
      getPrivateKey,
      regenerateRecoveryPhrase,
      changePassword,
      recoveryPhrase,
      dismissRecoveryPhrase,
    }),
    [
      unlocked,
      userHasVault,
      unlockOrCreate,
      unlock,
      lock,
      ensureUnlocked,
      getVaultKeyRaw,
      getPrivateKey,
      regenerateRecoveryPhrase,
      changePassword,
      recoveryPhrase,
      dismissRecoveryPhrase,
    ]
  );

  return (
    <VaultContext.Provider value={value}>
      {children}
      <UnlockVaultModal
        open={unlockOpen}
        userHasVault={userHasVault}
        onClose={() => {
          setUnlockOpen(false);
          failPending('Vault unlock cancelled.');
        }}
        onUnlock={unlock}
      />
      <RecoveryPhraseModal
        open={!!recoveryPhrase}
        phrase={recoveryPhrase ?? ''}
        onClose={dismissRecoveryPhrase}
      />
    </VaultContext.Provider>
  );
};

export const useVault = (): VaultContextValue => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
};

