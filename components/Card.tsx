
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  noBlur?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', noBlur = false, ...props }) => (
  <div 
    className={`bg-white/90 dark:bg-gray-800/95 ${!noBlur ? 'backdrop-blur-sm' : ''} shadow-sm border border-white/20 dark:border-gray-700/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-md dark:text-gray-100 ${className}`} 
    style={{ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' }}
    {...props}
  >
    {children}
  </div>
);
