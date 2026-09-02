const HASH_REGEX = /^[a-fA-F0-9]{64}$/;
export const isValidSha256 = (hash: string): boolean => HASH_REGEX.test(hash);

/**
 * Computes the SHA-256 digest of raw file bytes in the browser using
 * WebCrypto. The digest is exactly what gets registered on-chain.
 */
export const sha256File = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

export const ACCEPTED_LABEL = 'PDF, DOC, DOCX, PNG, JPG';
export const MAX_FILE_SIZE_MB = 10;

export const validateFile = (file: File): string | null => {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  const allowedExt = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
  if (!ACCEPTED_TYPES.includes(file.type) || !allowedExt.includes(ext)) {
    return `Unsupported file type "${file.name}". Allowed: ${ACCEPTED_LABEL}.`;
  }
  if (file.size === 0) {
    return 'The selected file is empty.';
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File exceeds the ${MAX_FILE_SIZE_MB} MB limit.`;
  }
  return null;
};
