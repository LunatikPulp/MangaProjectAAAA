export interface AvatarFrame {
  name: string;
  image?: string;
  requiredLevel: number;
}

export const AVATAR_FRAMES: Record<string, AvatarFrame> = {
  'none':                      { name: 'Нет рамки',              requiredLevel: 1 },
  'frame_rusty_gear':          { name: 'Ржавая Шестерня',        image: '/Frames_lvl/Rusty_gear.png',           requiredLevel: 5 },
  'frame_neon_wire':           { name: 'Неоновая Проволока',     image: '/Frames_lvl/Neon_wire.png',            requiredLevel: 10 },
  'frame_animatronic_jaw':     { name: 'Челюсть Аниматроника',   image: '/Frames_lvl/Animatronic_Jaw.png',      requiredLevel: 15 },
  'frame_golden_rule':         { name: 'Золотое Правило',        image: '/Frames_lvl/The_Golden_Rule.png',      requiredLevel: 25 },
  'frame_poisonous_vine':      { name: 'Ядовитая Лоза',          image: '/Frames_lvl/Poisonous_vine.png',       requiredLevel: 35 },
  'frame_system_glitch':       { name: 'Системный Глитч',        image: '/Frames_lvl/System_Glitch.png',        requiredLevel: 50 },
};

export function getFrameImage(frameKey?: string): string | null {
  if (!frameKey || frameKey === 'none') return null;
  const frame = AVATAR_FRAMES[frameKey];
  return frame?.image || null;
}
