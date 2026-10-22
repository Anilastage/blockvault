import { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api';

interface UnlockVaultModalProps {
  open: boolean;
  userHasVault: boolean | null;
  onClose: () => void;
  onUnlock: (password: string) => Promise<void>;
}

export const UnlockVaultModal = ({
  open,
  userHasVault,
  onClose,
  onUnlock,
}: UnlockVaultModalProps) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  const creating = userHasVault === false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating && password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (!password) {
      setError('Enter your account password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onUnlock(password);
      setPassword('');
    } catch (err) {
      if (err instanceof DOMException) {
        setError(
          creating
            ? 'Could not create your encryption vault. Try again.'
            : 'That password could not unlock your vault. Check it and try again.'
        );
      } else {
        setError(
          getApiErrorMessage(err) ||
            (creating
              ? 'Could not create your encryption vault.'
              : 'That password could not unlock your vault.')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? 'Create your encryption vault' : 'Unlock your encryption vault'}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-primary-50 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary-600 shadow-sm">
            {creating ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </span>
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-dark">
              {creating ? 'One-time vault setup' : 'Your vault is locked'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed">
              {creating
                ? 'Use your account password. We derive the encryption key locally; the vault key is never sent to the server in the clear.'
                : 'Enter the password you use to sign in. It unlocks your documents locally and is never stored in plaintext.'}
            </p>
          </div>
        </div>

        <Input
          label={creating ? 'Account password' : 'Vault password'}
          name="vault-password"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          error={error || undefined}
          hint={
            creating
              ? 'You will also receive a recovery phrase. Keep it somewhere safe.'
              : undefined
          }
        />

        <div className="flex gap-2">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            fullWidth
            loading={loading}
            icon={<KeyRound className="h-4 w-4" />}
          >
            {creating ? 'Create vault' : 'Unlock'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

