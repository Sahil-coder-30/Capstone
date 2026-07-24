import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  listProjectsAPI,
  createProjectAPI,
  stopSandboxAPI,
  deleteProjectAPI
} from '../service/dashboard.api';
import {
  setProjects,
  addProject,
  removeProject,
  updateProjectStatus,
  setActiveTab,
  setSearchQuery,
  setDashboardLoading,
  setDashboardError
} from '../slice/dashboard.slice';
import { getCachedProjects, setCachedProjects, upsertCachedProject } from '../../editor/service/dbService';

export const useDashboard = () => {
  const dispatch = useDispatch();
  const state = useSelector((reduxState) => reduxState.dashboard);

  const listProjects = useCallback(async () => {
    const res = await listProjectsAPI();
    if (res.status === 'success') {
      const fetched = res.projects || [];
      dispatch(setProjects(fetched));
      await setCachedProjects(fetched);
    }
    return res;
  }, [dispatch]);

  const fetchProjects = useCallback(async () => {
    try {
      dispatch(setDashboardLoading(true));
      const res = await listProjectsAPI();
      if (res.status === 'success') {
        const fetched = res.projects || [];
        dispatch(setProjects(fetched));
        await setCachedProjects(fetched);
        return fetched;
      }
    } catch (err) {
      console.warn('[dashboard] Fetch failed — restoring from IndexedDB cache');
      const cached = await getCachedProjects();
      if (cached) {
        dispatch(setProjects(cached));
        return cached;
      } else {
        dispatch(setDashboardError(err.message || 'Failed to load projects'));
      }
    } finally {
      dispatch(setDashboardLoading(false));
    }
  }, [dispatch]);

  const createProject = useCallback(async (title) => {
    try {
      dispatch(setDashboardLoading(true));
      const res = await createProjectAPI(title);
      if (res.status === 'success' && res.project) {
        dispatch(addProject(res.project));
        await upsertCachedProject(res.project);
      }
      return res;
    } catch (err) {
      dispatch(setDashboardError(err.message || 'Failed to create project'));
      throw err;
    } finally {
      dispatch(setDashboardLoading(false));
    }
  }, [dispatch]);

  const stopProject = useCallback(async (projectId) => {
    try {
      await stopSandboxAPI(projectId);
      dispatch(updateProjectStatus({ projectId, status: 'down' }));
    } catch (err) {
      console.error('[dashboard] Failed to stop sandbox:', err);
    }
  }, [dispatch]);

  const deleteProject = useCallback(async (projectId) => {
    try {
      dispatch(setDashboardLoading(true));
      await deleteProjectAPI(projectId);
      dispatch(removeProject(projectId));
    } catch (err) {
      dispatch(setDashboardError(err.message || 'Failed to delete project'));
      throw err;
    } finally {
      dispatch(setDashboardLoading(false));
    }
  }, [dispatch]);

  const changeTab = useCallback((tab) => {
    dispatch(setActiveTab(tab));
  }, [dispatch]);

  const changeSearch = useCallback((query) => {
    dispatch(setSearchQuery(query));
  }, [dispatch]);

  return {
    ...state,
    listProjects,
    fetchProjects,
    createProject,
    stopProject,
    deleteProject,
    changeTab,
    changeSearch
  };
};
