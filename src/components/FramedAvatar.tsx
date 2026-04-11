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
  const src = avatarUrl && avatarUrl.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl;
  const frameSrc = frameImage && frameImage.startsWith('/') ? `${API_BASE}${frameImage}` : frameImage;

  const handleClick = () => {
    setIsGlitching(true);
    setTimeout(() => setIsGlitching(false), 300);
  };

  const avatarElement = src
    ? <img src={src} alt={username} className="w-full h-full rounded-full object-cover" />
    : <Avatar name={username} size={frameImage ? Math.round(size * 0.7) : size} />;

  // For small sizes use tighter ratio to avoid oversized container
  const ratio = size <= 40 ? 0.78 : 0.7;
  const containerSize = Math.round(size / ratio);

  if (!frameImage) {
    return (
      <div
        className={`flex items-center justify-center cursor-pointer ${className || ''} ${isGlitching ? 'springtrap-glitch' : ''}`}
        style={{ width: containerSize, height: containerSize }}
        onClick={handleClick}
      >
        {src
          ? <img src={src} alt={username} style={{ width: size, height: size }} className="rounded-full object-cover" />
          : <Avatar name={username} size={size} />
        }
      </div>
    );
  }
  const avatarSize = size;

  return (
    <div
      className={`relative shrink-0 cursor-pointer ${className || ''} ${isGlitching ? 'springtrap-glitch' : ''}`}
      style={{ width: containerSize, height: containerSize }}
      onClick={handleClick}
    >
      <div
        className="rounded-full overflow-hidden absolute"
        style={{
          width: avatarSize,
          height: avatarSize,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {avatarElement}
      </div>
      <img
        src={frameSrc || ''}
        alt="frame"
        className="absolute inset-0 w-full h-full pointer-events-none z-[5]"
        style={{ objectFit: 'fill' }}
      />
    </div>
  );
};

export default FramedAvatar;
