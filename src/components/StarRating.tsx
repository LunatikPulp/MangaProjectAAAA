import React, { useState } from 'react';
import StarIcon from './icons/StarIcon';

interface StarRatingProps {
  rating?: number;
  onRate: (rating: number) => void;
  totalStars?: number;
  size?: 'sm' | 'md' | 'lg';
}

const StarRating: React.FC<StarRatingProps> = ({ rating = 0, onRate, totalStars = 5, size = 'md' }) => {
  const [hover, setHover] = useState(0);

  const starSize = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';

  return (
    <div className="flex items-center gap-1">
      {[...Array(totalStars)].map((_, index) => {
        const ratingValue = index + 1;
        return (
          // FIX: Moved onMouseEnter and onMouseLeave handlers to the label, as the StarIcon component doesn't accept them.
          <label
            key={index}
            onMouseEnter={() => setHover(ratingValue)}
            onMouseLeave={() => setHover(0)}
          >
            <input
              type="radio"
              name="rating"
              className="hidden"
              value={ratingValue}
              onClick={() => onRate(ratingValue)}
            />
            <StarIcon
              className={`${starSize} cursor-pointer transition-colors duration-200 ${
                ratingValue <= (hover || rating) ? 'text-brand-accent' : 'text-overlay'
              }`}
            />
          </label>
        );
      })}
    </div>
  );
};

export default StarRating;
