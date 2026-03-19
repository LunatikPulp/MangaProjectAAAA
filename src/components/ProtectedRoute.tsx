import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const PageSkeleton: React.FC = () => (
    <div className="space-y-8 animate-pulse">
        <div className="h-8 bg-surface rounded-md w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <div className="aspect-[2/3] bg-surface rounded-md"></div>
                    <div className="h-4 bg-surface rounded-md w-2/3"></div>
                    <div className="h-4 bg-surface rounded-md w-full"></div>
                </div>
            ))}
        </div>
    </div>
);


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return <PageSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;