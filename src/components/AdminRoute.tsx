import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useContext(AuthContext);

  if (user?.role !== 'admin') {
    // If user is not an admin, redirect them. 
    // We can show an unauthorized page or redirect to home.
    return <Navigate to="/" replace />;
  }

  // Use ProtectedRoute to handle the loading state and basic auth check
  return <ProtectedRoute>{children}</ProtectedRoute>;
};

export default AdminRoute;
