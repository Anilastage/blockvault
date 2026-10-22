export interface VaultAccessor {
  getVaultKeyRaw: () => Promise<Uint8Array>;
  getPrivateKey: () => Promise<CryptoKey>;
}

let accessor: VaultAccessor | null = null;

export const setVaultAccessor = (next: VaultAccessor | null): void => {
  accessor = next;
};

export const getVaultAccessor = (): VaultAccessor | null => accessor;
