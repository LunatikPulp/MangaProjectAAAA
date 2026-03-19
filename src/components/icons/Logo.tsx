import React from 'react';

const Logo: React.FC<{ className?: string }> = ({ className }) => (
    <img
        src="/Logo/springmanga.png"
        alt="SpringManga"
        width={50}
        height={50}
        className={className}
        style={{ objectFit: 'contain' }}
    />
);

export default Logo;
