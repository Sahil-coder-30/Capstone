import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchSettingsThunk, 
  fetchCreditThunk,
  updateProfileThunk, 
  updatePreferencesThunk, 
  generateApiKeyThunk, 
  deleteApiKeyThunk,
  clearSettingsError
} from '../slice/settings.slice';

export const useSettings = () => {
  const dispatch = useDispatch();
  const { 
    profile, 
    preferences, 
    credit,
    apiKeys, 
    loading, 
    error 
  } = useSelector((state) => state.settings);

  const loadSettings = useCallback(() => {
    dispatch(fetchSettingsThunk());
  }, [dispatch]);

  const loadCredit = useCallback(() => {
    dispatch(fetchCreditThunk());
  }, [dispatch]);

  const updateProfile = useCallback((profileData) => {
    return dispatch(updateProfileThunk(profileData)).unwrap();
  }, [dispatch]);

  const updatePreferences = useCallback((preferencesData) => {
    return dispatch(updatePreferencesThunk(preferencesData)).unwrap();
  }, [dispatch]);

  const generateApiKey = useCallback((keyName) => {
    return dispatch(generateApiKeyThunk(keyName)).unwrap();
  }, [dispatch]);

  const deleteApiKey = useCallback((keyId) => {
    return dispatch(deleteApiKeyThunk(keyId)).unwrap();
  }, [dispatch]);

  const clearError = useCallback(() => {
    dispatch(clearSettingsError());
  }, [dispatch]);

  return {
    profile,
    preferences,
    credit,
    apiKeys,
    loading,
    error,
    loadSettings,
    loadCredit,
    updateProfile,
    updatePreferences,
    generateApiKey,
    deleteApiKey,
    clearError
  };
};
