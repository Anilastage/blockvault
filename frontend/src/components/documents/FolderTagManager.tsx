import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Folder, Plus, Tag, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { documentService } from '@/services/documentService';
import { getApiErrorMessage } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import type { DocumentItem, Folder as FolderType } from '@/types';

const MAX_TAGS = 8;

interface FolderTagManagerProps {
  open: boolean;
  onClose: () => void;
  document: DocumentItem | null;
  folders: FolderType[];
  onSaved?: () => void;
}

export const FolderTagManager = ({
  open,
  onClose,
  document,
  folders,
  onSaved,
}: FolderTagManagerProps) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState('none');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (open && document) {
      setFolderId(document.folderId ? document.folderId : 'none');
      setTags(document.tags ?? []);
      setTagInput('');
      setNewFolderName('');
    }
  }, [open, document]);

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || tag.length > 24) {
      setTagInput('');
      return;
    }
    if (tags.includes(tag)) {
      setTagInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) return;
    setTags([...tags, tag]);
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const createFolderInline = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const folder = await documentService.createFolder(name);
      setFolderId(folder._id);
      setNewFolderName('');
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast('Folder created.', 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Could not create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const save = async () => {
    if (!document) return;
    setSaving(true);
    try {
      await documentService.updateOrganization(document._id, {
        folderId: folderId === 'none' ? null : folderId,
        tags,
      });
      toast('Document organized.', 'success');
      onClose();
      onSaved?.();
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Could not organize document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Organize document"
      size="md"
    >
      {document ? (
        <div className="space-y-5">
          <p className="truncate text-sm font-medium text-dark">{document.originalName}</p>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Folder className="h-4 w-4 text-slate-400" /> Folder
            </label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="input-base w-full"
              disabled={saving}
            >
              <option value="none">Unfiled</option>
              {folders.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void createFolderInline();
                  }
                }}
                placeholder="New folder name"
                className="input-base flex-1"
                disabled={creatingFolder}
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => void createFolderInline()}
                loading={creatingFolder}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Tag className="h-4 w-4 text-slate-400" /> Tags
            </label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-lg bg-secondary-500/10 px-2 py-1 text-xs font-medium text-secondary-500"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded p-0.5 transition-colors hover:bg-secondary-500/20"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder={`Add a tag and press Enter${tags.length >= MAX_TAGS ? ` (max ${MAX_TAGS})` : ''}`}
              className="input-base w-full"
              disabled={tags.length >= MAX_TAGS || saving}
            />
            <p className="text-xs text-slate-400">
              Tags are lowercase, up to {MAX_TAGS} per document. For example: contract, receipt, tax.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};