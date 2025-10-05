import { useCallback } from 'react';

export const pressableAnimation = () => {
  const handlePressIn = useCallback(() => {
    setTimeout(() => null, 500);
  }, []);
  
  return {
    handlePressIn,
  };
};