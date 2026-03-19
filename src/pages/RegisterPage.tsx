import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const RegisterPage: React.FC = () => {
    const { openAuthModal } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        openAuthModal('register');
        navigate('/', { replace: true });
    }, [navigate, openAuthModal]);

    return null;
};

export default RegisterPage;
