import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { 
  fetchSettingsAPI, 
  updateProfileSettingsAPI, 
  updatePreferencesAPI, 
  fetchCreditAPI,
  generateApiKeyAPI, 
  deleteApiKeyAPI 
} from '../service/settings.api';

// ─── Async Thunks ──────────────────────────────────────────────────────────
export const fetchSettingsThunk = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      const data = await fetchSettingsAPI();
      return data.settings;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load settings');
    }
  }
);

export const fetchCreditThunk = createAsyncThunk(
  'settings/fetchCredit',
  async (_, { rejectWithValue }) => {
    try {
      const data = await fetchCreditAPI();
      return data.credit;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load credit details');
    }
  }
);

export const updateProfileThunk = createAsyncThunk(
  'settings/updateProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      const data = await updateProfileSettingsAPI(profileData);
      return data.profile;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to save profile');
    }
  }
);

export const updatePreferencesThunk = createAsyncThunk(
  'settings/updatePreferences',
  async (preferencesData, { rejectWithValue }) => {
    try {
      const data = await updatePreferencesAPI(preferencesData);
      return data.preferences;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to save preferences');
    }
  }
);

export const generateApiKeyThunk = createAsyncThunk(
  'settings/generateApiKey',
  async (keyName, { rejectWithValue }) => {
    try {
      const data = await generateApiKeyAPI(keyName);
      return data.key;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to generate API Key');
    }
  }
);

export const deleteApiKeyThunk = createAsyncThunk(
  'settings/deleteApiKey',
  async (keyId, { rejectWithValue }) => {
    try {
      const data = await deleteApiKeyAPI(keyId);
      return data.deletedId || keyId;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to delete API Key');
    }
  }
);

// ─── Slice Definition ───────────────────────────────────────────────────────
const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    profile: {
      bio: 'Full Stack Software Engineer building with CodeSpace.',
      linkedin: '',
      github: '',
      twitter: '',
      website: '',
      location: '',
      company: '',
      jobTitle: '',
      skills: [],
      experienceYears: 0
    },
    preferences: {
      theme: 'dark',
      editor: {
        fontSize: '14px',
        tabSize: '2',
        autoSave: true,
        minimap: true,
        wordWrap: true
      },
      copilot: {
        modelPreference: 'gemini-2.5-flash',
        autoSuggest: true,
        interactiveMode: 'detailed'
      },
      notifications: {
        emailLogins: true,
        securityAlerts: true
      }
    },
    credit: {
      credits: 20,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    apiKeys: [],
    loading: false,
    error: null
  },
  reducers: {
    clearSettingsError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettingsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettingsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.profile = { ...state.profile, ...action.payload.profile };
        state.preferences = { ...state.preferences, ...action.payload.preferences };
        state.apiKeys = action.payload.apiKeys || [];
      })
      .addCase(fetchSettingsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch credit
      .addCase(fetchCreditThunk.fulfilled, (state, action) => {
        state.credit = action.payload || { credits: 20, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      })
      // Update profile
      .addCase(updateProfileThunk.fulfilled, (state, action) => {
        state.profile = { ...state.profile, ...action.payload };
      })
      // Update preferences
      .addCase(updatePreferencesThunk.fulfilled, (state, action) => {
        state.preferences = { ...state.preferences, ...action.payload };
      })
      // Generate key
      .addCase(generateApiKeyThunk.fulfilled, (state, action) => {
        state.apiKeys.push(action.payload);
      })
      // Delete key
      .addCase(deleteApiKeyThunk.fulfilled, (state, action) => {
        state.apiKeys = state.apiKeys.filter(k => k.id !== action.payload);
      });
  }
});

export const { clearSettingsError } = settingsSlice.actions;
export default settingsSlice.reducer;
