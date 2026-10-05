import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { formatBytes } from '../lib/format';

type ImageInputProps = {
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled: boolean;
};

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
const ACCEPT_ATTRIBUTE = 'image/png,image/jpeg,image/webp';

/** Keeps a stray huge file from locking up the preview. */
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;

function isAcceptedImage(file: File): boolean {
  if ((ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) return true;

  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function validate(file: File): string | null {
  if (!isAcceptedImage(file)) {
    return `“${file.name}” is not a supported image. Use PNG, JPG/JPEG or WEBP.`;
  }
  if (file.size > MAX_PREVIEW_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. Choose an image under ${formatBytes(MAX_PREVIEW_BYTES)}.`;
  }
  return null;
}

export function ImageInput({ file, previewUrl, onSelect, onRemove, disabled }: ImageInputProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const accept = (candidate: File | undefined) => {
    if (!candidate) return;

    const message = validate(candidate);
    if (message) {
      setError(message);
      return;
    }

    setError(null);
    onSelect(candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(event.dataTransfer.files[0]);
  };

  const openPicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor="privacyguard-image">
          Image to analyse
        </label>
        <span className="field__formats">PNG · JPG/JPEG · WEBP</span>
      </div>

      <input
        ref={fileInputRef}
        id="privacyguard-image"
        className="visually-hidden"
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        disabled={disabled}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {file && previewUrl ? (
        <div className="preview">
          <img className="preview__image" src={previewUrl} alt={`Preview of ${file.name}`} />
          <div className="preview__meta">
            <p className="preview__name" title={file.name}>
              {file.name}
            </p>
            <p className="preview__size">{formatBytes(file.size)}</p>
            <button type="button" className="button button--ghost" onClick={onRemove} disabled={disabled}>
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`dropzone${dragging ? ' dropzone--active' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="dropzone__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 16V5m0 0L8 9m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" strokeLinecap="round" />
            </svg>
          </span>
          <p className="dropzone__title">Drag an image here</p>
          <p className="dropzone__body">Screenshots with text are the usual case.</p>
          <button type="button" className="button button--secondary" onClick={openPicker} disabled={disabled}>
            Choose a file
          </button>
        </div>
      )}

      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}