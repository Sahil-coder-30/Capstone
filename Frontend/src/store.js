import { configureStore } from '@reduxjs/toolkit';
import sandboxReducer from './features/sandbox/slice/sandbox.slice';
import editorReducer from './features/editor/slice/editor.slice';
import codingAgentReducer from './features/coding-agent/slice/codingAgent.slice';
import copilotReducer from './features/copilot/slice/copilot.slice';
import logsReducer from './features/logs/slice/logs.slice';
import authReducer from './features/auth/slice/auth.slice';
import settingsReducer from './features/settings/slice/settings.slice';
import paymentsReducer from './features/payments/slice/payments.slice';
import dashboardReducer from './features/dashboard/slice/dashboard.slice';

export const store = configureStore({
  reducer: {
    sandbox: sandboxReducer,
    editor: editorReducer,
    codingAgent: codingAgentReducer,
    copilot: copilotReducer,
    logs: logsReducer,
    auth: authReducer,
    settings: settingsReducer,
    payments: paymentsReducer,
    dashboard: dashboardReducer,
  },
});


