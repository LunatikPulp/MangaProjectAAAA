import React, { useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
    const { openAuthModal } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || "/";

    useEffect(() => {
        openAuthModal('login', from);
        navigate('/', { replace: true });
    }, [from, navigate, openAuthModal]);

    return null;
};

export default LoginPage;
