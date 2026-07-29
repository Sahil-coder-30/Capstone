import { configureStore } from '@reduxjs/toolkit';
import paymentsReducer from './features/payments/slice/payments.slice';

export const store = configureStore({
  reducer: {
    payments: paymentsReducer,
  },
});
