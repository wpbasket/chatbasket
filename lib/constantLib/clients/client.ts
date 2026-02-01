import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { fetch, FetchRequestInit } from 'expo/fetch';
import { Platform } from 'react-native';
import { Url } from '../constants/constants';
import { ApiError } from '../models/model.api';


const AUTH_WHITELIST = ['/auth/signup', '/auth/login', '/auth/signup-verification', '/auth/login-verification', '/auth/resend-otp'];

export class ApiClient {
  private baseURL = Url.BASE_URL;

  async request<T>(endpoint: string, options: FetchRequestInit = {}): Promise<T> {
    const isWeb = Platform.OS === 'web';
    const sessionId = authState.sessionId.get();
    const userId = authState.userId.get();

    const dynamicHeaders: Record<string, string> = {};
    // For mobile, we need to send the auth token in the header
    if (sessionId && userId && !AUTH_WHITELIST.includes(endpoint) && !isWeb) {
      dynamicHeaders['Authorization'] = `Bearer ${sessionId}:${userId}`;
    }
    // Normalize URL joining to avoid malformed URLs when endpoint lacks a leading slash
    const base = (this.baseURL || '').replace(/\/+$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${base}${path}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...dynamicHeaders,
        ...options.headers,
      },
      ...(isWeb && { credentials: 'include' }),
      ...options,
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }

      const { message = '', type = 'unknown_error', code = response.status } = errorData;

      // 🚫 Handle session expiration or invalid session
      if (['session_invalid', 'missing_auth'].includes(type)) {
        clearSession();

        // Toast can be shown if needed
        // Toast.show({
        //   type: 'error',
        //   text1: 'Session expired',
        //   text2: 'Please log in again.',
        // });
      }

      throw new ApiError(message, code, type, errorData);
    }

    return response.json();
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  patch<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
