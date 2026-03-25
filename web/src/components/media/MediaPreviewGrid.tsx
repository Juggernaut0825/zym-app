'use client';

import { memo } from 'react';

export interface MediaPreviewItem {
  url: string;
  isVideo: boolean;
  name: string;
}

interface MediaPreviewGridProps {
  items: MediaPreviewItem[];
  onRemove: (index: number) => void;
  wrapperClassName: string;
  itemClassName: string;
  mediaHeight?: number;
  showVideoControls?: boolean;
}

function MediaPreviewGridComponent({
  items,
  onRemove,
  wrapperClassName,
  itemClassName,
  mediaHeight = 96,
  showVideoControls = true,
}: MediaPreviewGridProps) {
  if (items.length === 0) return null;

  return (
    <div className={wrapperClassName}>
      {items.map((preview, index) => (
        <div key={`${preview.name}-${index}`} className={itemClassName}>
          {preview.isVideo ? (
            <video
              src={preview.url}
              controls={showVideoControls}
              muted={!showVideoControls}
              playsInline
              preload="metadata"
              style={{ width: '100%', height: mediaHeight, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              style={{ width: '100%', height: mediaHeight, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }}
            />
          )}
          <button
            className="btn media-thumb-remove"
            type="button"
            onClick={() => onRemove(index)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export const MediaPreviewGrid = memo(MediaPreviewGridComponent);
