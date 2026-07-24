import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  projects: [],
  activeTab: 'playground',
  searchQuery: '',
  loading: false,
  error: null
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setProjects(state, action) {
      state.projects = action.payload || [];
      state.loading = false;
      state.error = null;
    },
    addProject(state, action) {
      state.projects.unshift(action.payload);
    },
    removeProject(state, action) {
      state.projects = state.projects.filter(p => p._id !== action.payload);
    },
    updateProjectStatus(state, action) {
      const { projectId, status } = action.payload;
      const proj = state.projects.find(p => p._id === projectId);
      if (proj) {
        proj.status = status;
      }
    },
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
    setSearchQuery(state, action) {
      state.searchQuery = action.payload;
    },
    setDashboardLoading(state, action) {
      state.loading = action.payload;
    },
    setDashboardError(state, action) {
      state.error = action.payload;
      state.loading = false;
    }
  }
});

export const {
  setProjects,
  addProject,
  removeProject,
  updateProjectStatus,
  setActiveTab,
  setSearchQuery,
  setDashboardLoading,
  setDashboardError
} = dashboardSlice.actions;

export default dashboardSlice.reducer;
