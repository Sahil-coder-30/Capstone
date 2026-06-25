import { configureStore } from '@reduxjs/toolkit';
import sandboxReducer from './features/sandbox/slice/sandbox.slice';
import editorReducer from './features/editor/slice/editor.slice';
import chatReducer from './features/chat/slice/chat.slice';
import logsReducer from './features/logs/slice/logs.slice';

export const store = configureStore({
  reducer: {
    sandbox: sandboxReducer,
    editor: editorReducer,
    chat: chatReducer,
    logs: logsReducer,
  },
});
