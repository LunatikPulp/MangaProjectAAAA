import React from 'react';
import AvatarGen from 'boring-avatars';

interface AvatarProps {
  name: string;
  size: number;
}

const Avatar: React.FC<AvatarProps> = ({ name, size }) => {
  return (
    <AvatarGen
      size={size}
      name={name}
      variant="beam"
      colors={['#7A8755', '#A9FF00', '#3D2B1F', '#1A1A1A', '#2E2E2E']}
    />
  );
};

export default Avatar;
