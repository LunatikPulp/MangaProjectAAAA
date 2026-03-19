export interface AvatarFrame {
  name: string;
  image?: string;
  requiredLevel: number;
}

export const AVATAR_FRAMES: Record<string, AvatarFrame> = {
  'none':            { name: 'Нет рамки',              requiredLevel: 1 },
  'rusty-gear':      { name: 'Ржавая шестерня',         image: '/Frames/Rusty_gear.png',           requiredLevel: 1 },
  'neon-wire':       { name: 'Неоновый провод',         image: '/Frames/Neon_wire.png',            requiredLevel: 5 },
  'toxic-vines':     { name: 'Токсичные лозы',          image: '/Frames/Poisonous_vine.png',       requiredLevel: 8 },
  'golden-circuit':  { name: 'Золотая схема',           image: '/Frames/The_Golden_Rule.png',      requiredLevel: 12 },
  'animatronic-jaw': { name: 'Челюсть Аниматроника',    image: '/Frames/Animatronic_Jaw.png',      requiredLevel: 20 },
  'system-glitch':   { name: 'Системный сбой',          image: '/Frames/System_Glitch.png',        requiredLevel: 50 },
};

export function getFrameImage(frameKey?: string): string | null {
  if (!frameKey || frameKey === 'none') return null;
  return AVATAR_FRAMES[frameKey]?.image || null;
}
