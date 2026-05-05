export interface AvatarFrame {
  name: string;
  image?: string;
}

export const AVATAR_FRAMES: Record<string, AvatarFrame> = {
  'none': { name: 'Нет рамки' },
};

export function getFrameImage(frameKey?: string): string | null {
  if (!frameKey || frameKey === 'none') return null;
  const frame = AVATAR_FRAMES[frameKey];
  if (frame?.image) return frame.image;
  if (frameKey.startsWith('frame_')) return `/Frames_shop/${frameKey}.png`;
  return null;
}
