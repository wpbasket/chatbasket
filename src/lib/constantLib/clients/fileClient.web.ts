import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { fetch, FetchRequestInit } from 'expo/fetch';
import { Url } from '../constants/constants';
import { ApiError } from '../models/model.api';

const AUTH_WHITELIST = ['/auth/signup', '/auth/login', '/auth/signup-verification', '/auth/login-verification', '/auth/resend-otp', '/auth/forgot-password', '/auth/forgot-password-verify'];

export class FileUploadClient {
    private baseURL = Url.BASE_API_URL ? `${Url.BASE_API_URL.replace(/\/+$/, '')}/api` : ''

    // constructor() {
    //     console.log("📂 Using fileClient.ts (web)");
    // }
    async request<T>(endpoint: string, options: FetchRequestInit = {}): Promise<T> {
        const sessionId = authState.sessionId.get();
        const userId = authState.userId.get();

        const dynamicHeaders: Record<string, string> = {};
        if (sessionId && userId && !AUTH_WHITELIST.includes(endpoint)) {
            dynamicHeaders['Authorization'] = `Bearer ${sessionId}:${userId}`;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            headers: {
                ...dynamicHeaders,
                ...options.headers,
            },
            credentials: 'include', // ✅ Web-only
            ...options,
        });

        if (!response.ok) {
            let errorData: any = {};
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: response.statusText };
            }

            const { message = '', type = 'unknown_error', code = response.status } = errorData;
            if (['session_invalid', 'missing_auth', 'invalid_user_id', 'user_not_found'].includes(type)) {
                if (!AUTH_WHITELIST.includes(endpoint)) {
                    clearSession();
                }
            }

            throw new ApiError(message, code, type, errorData);
        }

        return response.json();
    }

    get<T>(endpoint: string) { return this.request<T>(endpoint, { method: 'GET' }); }
    post<T>(endpoint: string, data?: any) { return this.request<T>(endpoint, { method: 'POST', body: data }); }
    put<T>(endpoint: string, data?: any) { return this.request<T>(endpoint, { method: 'PUT', body: data }); }
    patch<T>(endpoint: string, data?: any) { return this.request<T>(endpoint, { method: 'PATCH', body: data }); }
    delete<T>(endpoint: string) { return this.request<T>(endpoint, { method: 'DELETE' }); }

    /**
     * Send FormData via XMLHttpRequest instead of fetch.
     * Consistent with chat's uploadFileWithProgress approach.
     * Web uses withCredentials (cookies) instead of Authorization header.
     */
    private xhrFormData<T>(method: string, endpoint: string, formData: FormData): Promise<T> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `${this.baseURL}${endpoint}`;

            xhr.open(method, url);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.withCredentials = true;

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch {
                        reject(new Error('Failed to parse upload response'));
                    }
                } else {
                    let errorData: any = {};
                    try {
                        errorData = JSON.parse(xhr.responseText);
                    } catch {
                        errorData = { message: `Upload failed with status ${xhr.status}` };
                    }
                    const { message = '', type = 'unknown_error', code = xhr.status } = errorData;
                    if (['session_invalid', 'missing_auth', 'invalid_user_id', 'user_not_found'].includes(type)) {
                        if (!AUTH_WHITELIST.includes(endpoint)) {
                            clearSession();
                        }
                    }
                    reject(new ApiError(message, code, type, errorData));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));

            xhr.send(formData);
        });
    }

    uploadFile<T>(endpoint: string, formData: FormData) {
        return this.xhrFormData<T>('POST', endpoint, formData);
    }
    updateFile<T>(endpoint: string, formData: FormData) {
        return this.xhrFormData<T>('PUT', endpoint, formData);
    }
}

export const fileUploadClient = new FileUploadClient();
