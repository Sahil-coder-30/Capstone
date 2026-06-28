# Feature-Based Hook-Driven Frontend Architecture

This skill defines the architectural guidelines and conventions for building frontend features. It ensures a clear separation of concerns by separating API interactions, state management, and business logic into dedicated layers.

## File & Folder Structure

For every frontend feature (e.g., `cart`, `auth`), the directory structure must follow this format:

```text
src/features/[feature_name]/
├── components/          # React components (pages, sections, UI blocks)
├── Hooks/               # Custom React hooks containing API & dispatch logic
│   └── [feature_name].hooks.js
├── service/            # Axios API instances & service functions
│   └── [feature_name].api.js
└── slice/               # Redux slices (ONLY for storing and assigning synchronous data)
    └── [feature_name].slice.js
```

---

## Architectural Layers & Responsibilities

### 1. Service Layer (`service/[feature].api.js`)
* **Responsibility**: Pure HTTP communication via Axios.
* **Rules**:
  * Only define and export functions that perform asynchronous network requests.
  * Do not reference Redux dispatch or state here.
  * Return raw `response.data` or handle generic network error mapping.

* **Example**:
  ```javascript
  import axios from 'axios';

  const api = axios.create({ baseURL: '/api/cart', withCredentials: true });

  export const fetchCartAPI = async () => {
      const response = await api.get('/get');
      return response.data;
  };
  ```

---

### 2. Redux Slice Layer (`slice/[feature].slice.js`)
* **Responsibility**: Storing state and providing synchronous data assignment.
* **Rules**:
  * **DO NOT** use `createAsyncThunk` or handle async logic in the slice.
  * Only define synchronous reducers (e.g., `setCart`, `setLoading`, `setError`).
  * Keep the state structure clean, representing only raw UI states.

* **Example**:
  ```javascript
  import { createSlice } from "@reduxjs/toolkit";

  const cartSlice = createSlice({
      name: "cart",
      initialState: {
          items: [],
          isLoading: false,
          error: null,
      },
      reducers: {
          setCart(state, action) {
              state.items = action.payload.items;
          },
          setLoading(state, action) {
              state.isLoading = action.payload;
          },
          setError(state, action) {
              state.error = action.payload;
          }
      }
  });

  export const { setCart, setLoading, setError } = cartSlice.actions;
  export default cartSlice.reducer;
  ```

---

### 3. Custom Hooks Layer (`Hooks/[feature].hooks.js`)
* **Responsibility**: Orchestrating business logic, asynchronous actions, and state changes.
* **Rules**:
  * Fetch data from the API Service layer.
  * Dispatch the synchronous mutations (`setLoading`, `setCart`, `setError`) to Redux.
  * Return methods for components to call.
  * Handle local loading/error flows using `try-catch-finally`.

* **Example**:
  ```javascript
  import { useDispatch } from 'react-redux';
  import { fetchCartAPI } from '../service/cart.api';
  import { setCart, setLoading, setError } from '../slice/cart.slice';

  export const useCart = () => {
      const dispatch = useDispatch();

      const authFetchCart = async () => {
          try {
              dispatch(setLoading(true));
              const data = await fetchCartAPI();
              dispatch(setCart(data.cart));
              return data.cart;
          } catch (error) {
              dispatch(setError(error.message));
              throw error;
          } finally {
              dispatch(setLoading(false));
          }
      };

      return { authFetchCart };
  };
  ```

---

### 4. Components Layer (`components/`)
* **Responsibility**: UI rendering and user interactions.
* **Rules**:
  * **Never** call services/APIs directly.
  * **Never** dispatch low-level slice setters directly (e.g., `dispatch(setCart(...))`) for API operations.
  * Select state using `useSelector((state) => state.[feature])`.
  * Call function handlers destructured from the custom hook (e.g., `const { authFetchCart } = useCart()`).

* **Example**:
  ```javascript
  import React, { useEffect } from 'react';
  import { useSelector } from 'react-redux';
  import { useCart } from '../../hooks/cart.hooks';

  const CartPage = () => {
      const { authFetchCart } = useCart();
      const { items, isLoading } = useSelector((state) => state.cart);

      useEffect(() => {
          authFetchCart();
      }, []);

      if (isLoading) return <div>Loading...</div>;

      return (
          <ul>
              {items.map(item => <li key={item._id}>{item.product.title}</li>)}
          </ul>
      );
  };
  ```
