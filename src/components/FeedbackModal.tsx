import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { openUrl } from '../lib/api';

const REPO_URL = 'https://github.com/GlenatDF/projectTrack';

type FeedbackType = 'bug' | 'feature' | 'feedback';

const TYPES: { value: FeedbackType; label: string; githubLabel: string }[] = [
  { value: 'bug',      label: 'Bug report',       githubLabel: 'bug'         },
  { value: 'feature',  label: 'Feature request',  githubLabel: 'enhancement' },
  { value: 'feedback', label: 'General feedback',  githubLabel: 'feedback'    },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: Props) {
  const [type, setType]         = useState<FeedbackType>('feedback');
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');

  function reset() {
    setType('feedback');
    setTitle('');
    setDesc('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    const selected = TYPES.find((t) => t.value === type)!;
    const issueTitle = title.trim() || selected.label;
    const params = new URLSearchParams({
      title:  issueTitle,
      labels: selected.githubLabel,
      body:   description.trim() || '',
    });
    openUrl(`${REPO_URL}/issues/new?${params.toString()}`).catch(() => {});
    handleClose();
  }

  const canSubmit = description.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send Feedback"
      subtitle="Opens a pre-filled issue on GitHub in your browser"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            <ExternalLink size={12} />
            Open GitHub issue
          </Button>
        </>
      }
    >
      {/* Type selector */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-2">Type</label>
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={[
                'flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors cursor-default border',
                type === t.value
                  ? 'bg-violet-500/20 text-slate-100 border-violet-500/50'
                  : 'bg-panel text-slate-500 border-border hover:text-slate-300 hover:bg-hover',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">
          Title <span className="text-slate-600">(optional)</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary…"
          className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Description <span className="text-red-600">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe the issue or idea…"
          rows={5}
          className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-colors resize-none"
        />
      </div>
    </Modal>
  );
}
