import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { fetch, FetchRequestInit } from 'expo/fetch';
import { Platform } from 'react-native';
import { Url } from '../constants/constants';
import { ApiError } from '../models/model.api';


const AUTH_WHITELIST = ['/auth/signup', '/auth/login', '/auth/signup-verification', '/auth/login-verification', '/auth/resend-otp'];

export class ApiClient {
  public baseURL = Url.BASE_API_URL

  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const base = (this.baseURL || '').replace(/\/+$|\/+$/g, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${base}${path}`;

    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      searchParams.append(key, String(value));
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  async request<T>(endpoint: string, options: FetchRequestInit = {}): Promise<T> {
    const isWeb = Platform.OS === 'web';
    const sessionId = authState.sessionId.get();
    const userId = authState.userId.get();

    const dynamicHeaders: Record<string, string> = {};
    // For mobile, we need to send the auth token in the header
    if (sessionId && userId && !AUTH_WHITELIST.includes(endpoint) && !isWeb) {
      dynamicHeaders['Authorization'] = `Bearer ${sessionId}:${userId}`;
    }
    const isAbsolute = /^https?:\/\//i.test(endpoint);
    const url = isAbsolute ? endpoint : this.buildUrl(endpoint);

    const bodyIsFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(!bodyIsFormData ? { 'Content-Type': 'application/json' } : {}),
      ...dynamicHeaders,
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(url, {
      headers,
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
      if (['session_invalid', 'missing_auth', 'invalid_user_id', 'user_not_found'].includes(type)) {
        if (!AUTH_WHITELIST.includes(endpoint)) {
          clearSession();
        }

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

  get<T>(endpoint: string, params?: Record<string, any>) {
    const url = this.buildUrl(endpoint, params);
    return this.request<T>(url, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: any, options?: FetchRequestInit) {
    const body = data instanceof FormData ? data : data !== undefined ? JSON.stringify(data) : undefined;
    return this.request<T>(endpoint, {
      method: 'POST',
      body,
      ...options,
    });
  }

  put<T>(endpoint: string, data?: any, options?: FetchRequestInit) {
    const body = data instanceof FormData ? data : data !== undefined ? JSON.stringify(data) : undefined;
    return this.request<T>(endpoint, {
      method: 'PUT',
      body,
      ...options,
    });
  }

  patch<T>(endpoint: string, data?: any, options?: FetchRequestInit) {
    const body = data instanceof FormData ? data : data !== undefined ? JSON.stringify(data) : undefined;
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body,
      ...options,
    });
  }

  delete<T>(endpoint: string, params?: Record<string, any>) {
    const url = this.buildUrl(endpoint, params);
    return this.request<T>(url, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
