import React from 'react';
import { motion } from 'framer-motion';

const pageVariants = {
    initial: {
        opacity: 0,
        y: 20
    },
    in: {
        opacity: 1,
        y: 0
    },
    out: {
        opacity: 0,
        y: -20
    }
};

// FIX: Added 'as const' to provide a specific type for the transition object, resolving the type mismatch with Framer Motion's 'Transition' type where TypeScript was inferring 'string' instead of specific literal types like 'tween'.
const pageTransition = {
    type: "tween",
    ease: "anticipate",
    duration: 0.4
} as const;

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <motion.div
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
        >
            {children}
        </motion.div>
    );
};

export default PageTransition;