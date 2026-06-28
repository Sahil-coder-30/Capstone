import axios from 'axios';

/**
 * Fetch details of the currently logged-in user.
 * Returns the user model (name, email, photo, etc.) from Google OAuth.
 */
export const fetchMeAPI = async () => {
  const response = await axios.get('/api/auth/getMe');
  return response.data;
};

/**
 * Logout the current user.
 * Calls the backend which blacklists the JWT in Redis and clears the httpOnly cookie.
 */
export const logoutAPI = async () => {
  const response = await axios.post('/api/auth/logout');
  return response.data;
};
