import React, { useState } from 'react';
import Avatar from './Avatar';
import { getFrameImage } from '../config/avatarFrames';
import { API_BASE } from '../services/externalApiService';

interface FramedAvatarProps {
  avatarUrl?: string;
  username: string;
  size: number;
  frameKey?: string;
  className?: string;
}

const FramedAvatar: React.FC<FramedAvatarProps> = ({ avatarUrl, username, size, frameKey, className }) => {
  const [isGlitching, setIsGlitching] = useState(false);
  const frameImage = getFrameImage(frameKey);
  const src = avatarUrl && avatarUrl.startsWith('/') && !avatarUrl.startsWith('/api') ? `${API_BASE}${avatarUrl}` : avatarUrl;
  const frameSrc = frameImage;

  const handleClick = () => {
    setIsGlitching(true);
    setTimeout(() => setIsGlitching(false), 300);
  };

  // Margin для рамки (чтобы scale-125 не обрезался)
  const margin = frameImage ? size * 0.125 : 0;

  if (!frameImage) {
    return (
      <div
        className={`flex items-center justify-center cursor-pointer ${className || ''} ${isGlitching ? 'springtrap-glitch' : ''}`}
        style={{ width: size, height: size }}
        onClick={handleClick}
      >
        {src
          ? <img src={src} alt={username} style={{ width: size, height: size, borderRadius: 12 }} className="object-cover" />
          : <Avatar name={username} size={size} />
        }
      </div>
    );
  }

  return (
    <div
      className={`relative flex shrink-0 cursor-pointer overflow-visible ${className || ''} ${isGlitching ? 'springtrap-glitch' : ''}`}
      style={{ width: size + margin * 2, height: size + margin * 2, borderRadius: 12 }}
      onClick={handleClick}
    >
      <div className="relative flex shrink-0" style={{ width: size, height: size, margin, borderRadius: 12 }}>
        {/* Avatar — z-[1], rounded */}
        {src ? (
          <img
            src={src}
            alt={username}
            className="z-[1] aspect-square size-full object-cover select-none"
            style={{ borderRadius: 12 }}
          />
        ) : (
          <div className="z-[1] aspect-square size-full flex items-center justify-center" style={{ borderRadius: 12, overflow: 'hidden' }}>
            <Avatar name={username} size={size} />
          </div>
        )}
        {/* Frame — z-[2], scale-125, absolute top-left */}
        <span className="inline-flex shrink-0 absolute top-0 left-0 z-[2] scale-125 select-none pointer-events-none">
          <img
            src={frameSrc || ''}
            alt="frame"
            className="w-full h-full"
            style={{ width: size, height: size }}
          />
        </span>
      </div>
    </div>
  );
};

export default FramedAvatar;
