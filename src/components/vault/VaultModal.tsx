import React from 'react';
import { Lock, LockOpen, Shield, Zap, FlaskConical, Plus } from 'lucide-react';
import { useGKStore } from '../../store';
import { Modal, Button, Input, Badge } from '../common/UI';
import { vaultTypeColor } from '../../core/vault';
import type { VaultType } from '../../core/db';
import { formatDate } from '../../utils/format';

const VAULT_TYPES: Array<{ id: VaultType; icon: React.ReactNode; label: string; desc: string }> = [
  { id: 'standard', icon: <Shield size={14} />, label: 'Standard', desc: 'General encrypted storage' },
  { id: 'forensic', icon: <FlaskConical size={14} />, label: 'Forensic', desc: 'Evidence-grade encryption' },
  { id: 'ephemeral', icon: <Zap size={14} />, label: 'Ephemeral', desc: 'Auto-wipes in 24 hours' },
];

// ─── Create Vault Form ────────────────────────────────────────────────────────

const CreateVaultForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { createVaultAction } = useGKStore();
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<VaultType>('standard');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name required'); return; }
    if (password.length < 6) { setError('Password must be 6+ characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await createVaultAction(name.trim(), type, password);
      onDone();
    } catch (e) {
      setError('Failed to create vault');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        label="Vault Name"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Evidence Case 01"
      />

      {/* Type selection */}
      <div>
        <div className="text-xs text-ghost-muted mb-2">Vault Type</div>
        <div className="grid grid-cols-3 gap-2">
          {VAULT_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all ${
                type === t.id
                  ? 'border-ghost-accent bg-ghost-accent/10'
                  : 'border-ghost-border hover:border-ghost-border/80'
              }`}
            >
              <span style={{ color: vaultTypeColor(t.id) }}>{t.icon}</span>
              <span className="text-xs font-medium text-ghost-text">{t.label}</span>
              <span className="text-[9px] text-ghost-muted">{t.desc}</span>
            </button>
          ))}
        </div>
        {type === 'ephemeral' && (
          <p className="text-[10px] text-ghost-red mt-2 flex items-center gap-1">
            <Zap size={10} />
            This vault will auto-wipe 24 hours after creation
          </p>
        )}
      </div>

      <Input
        label="Password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Min 6 characters"
      />
      <Input
        label="Confirm Password"
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        error={error || undefined}
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
      />

      <Button
        variant="primary"
        className="w-full justify-center"
        onClick={handleCreate}
        disabled={loading}
        icon={<Lock size={14} />}
      >
        {loading ? 'Creating…' : 'Create Vault'}
      </Button>
    </div>
  );
};

// ─── Unlock Form ──────────────────────────────────────────────────────────────

const UnlockForm: React.FC<{ vaultId: number; onDone: () => void }> = ({ vaultId, onDone }) => {
  const { unlockVaultAction } = useGKStore();
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleUnlock = async () => {
    setLoading(true);
    setError('');
    const ok = await unlockVaultAction(vaultId, password);
    setLoading(false);
    if (ok) onDone();
    else setError('Incorrect password');
  };

  return (
    <div className="space-y-3">
      <Input
        label="Vault Password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        error={error}
        onKeyDown={e => e.key === 'Enter' && handleUnlock()}
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1 justify-center"
          onClick={handleUnlock}
          disabled={loading}
          icon={<LockOpen size={14} />}
        >
          {loading ? 'Unlocking…' : 'Unlock'}
        </Button>
      </div>
    </div>
  );
};

// ─── Vault Card ───────────────────────────────────────────────────────────────

export const VaultCard: React.FC<{
  vault: import('../../core/db').GKVault;
  onSelect: () => void;
  selected: boolean;
}> = ({ vault, onSelect, selected }) => {
  const { lockVaultAction } = useGKStore();
  const color = vaultTypeColor(vault.type);

  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer transition-all ${
        selected ? 'border-ghost-accent bg-ghost-accent/5' : 'border-ghost-border hover:border-ghost-border/80 bg-ghost-card'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color }} className="vault-lock">
            {vault.isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
          </span>
          <span className="text-xs font-medium text-ghost-text">{vault.name}</span>
        </div>
        <Badge color={color} size="xs">{vault.type}</Badge>
      </div>
      <div className="flex items-center justify-between text-[9px] text-ghost-muted">
        <span>{vault.fileIds.length} file{vault.fileIds.length !== 1 ? 's' : ''}</span>
        <span>{formatDate(vault.createdAt)}</span>
      </div>
      {vault.type === 'ephemeral' && vault.ephemeralWipeAt && (
        <div className="mt-1.5 text-[9px] text-ghost-red flex items-center gap-1">
          <Zap size={8} />
          Wipes {formatDate(vault.ephemeralWipeAt)}
        </div>
      )}
      {!vault.isLocked && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-2 w-full justify-center text-ghost-muted"
          icon={<Lock size={10} />}
          onClick={e => { e.stopPropagation(); lockVaultAction(vault.id!); }}
        >
          Lock
        </Button>
      )}
    </div>
  );
};

// ─── Vault Modal ──────────────────────────────────────────────────────────────

export const VaultModal: React.FC = () => {
  const { showVaultModal, setShowVaultModal, vaults, activeVaultId, setActiveVault } = useGKStore();
  const [mode, setMode] = React.useState<'list' | 'create' | 'unlock'>('list');

  const activeVault = activeVaultId ? vaults.find(v => v.id === activeVaultId) : null;

  return (
    <Modal
      open={showVaultModal}
      onClose={() => { setShowVaultModal(false); setMode('list'); }}
      title={mode === 'create' ? 'Create Vault' : mode === 'unlock' ? 'Unlock Vault' : 'Vaults'}
      width="max-w-md"
    >
      {mode === 'create' ? (
        <CreateVaultForm onDone={() => setMode('list')} />
      ) : mode === 'unlock' && activeVault ? (
        <div>
          <div className="text-xs text-ghost-muted mb-3">Unlocking: <strong className="text-ghost-text">{activeVault.name}</strong></div>
          <UnlockForm vaultId={activeVault.id!} onDone={() => setMode('list')} />
          <Button variant="ghost" size="xs" className="mt-2" onClick={() => setMode('list')}>← Back</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ghost-muted">{vaults.length} vault{vaults.length !== 1 ? 's' : ''}</span>
            <Button
              variant="primary"
              size="xs"
              icon={<Plus size={12} />}
              onClick={() => setMode('create')}
            >
              New Vault
            </Button>
          </div>
          {vaults.length === 0 ? (
            <div className="text-center py-8 text-ghost-muted text-xs">
              No vaults yet. Create one to encrypt sensitive files.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {vaults.map(v => (
                <VaultCard
                  key={v.id}
                  vault={v}
                  selected={activeVaultId === v.id}
                  onSelect={() => {
                    setActiveVault(v.id!);
                    if (v.isLocked) setMode('unlock');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
