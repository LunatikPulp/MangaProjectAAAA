import React from 'react';

const CoinIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
    >
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.975.435-.975.975s.435.975.975.975h.008v3.696h-.008c-.54 0-.975.435-.975.975s.435.975.975.975h4.267c.54 0 .975-.435.975-.975s-.435-.975-.975-.975h-.008v-1.746h.008c.54 0 .975-.435.975-.975s-.435-.975-.975-.975h-4.267z" clipRule="evenodd" />
    </svg>
);

export default CoinIcon;