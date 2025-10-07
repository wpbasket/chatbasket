import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { fetch, FetchRequestInit } from 'expo/fetch';
import { Url } from '../constants/constants';
import { ApiError } from '../models/model.api';

const AUTH_WHITELIST = ['/auth/signup', '/auth/login', '/auth/verify-otp'];

export class FileUploadClient {
    private baseURL = Url.BASE_URL;

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
            if (code === 401 && ['session_invalid', 'missing_auth'].includes(type)) {
                clearSession();
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

    uploadFile<T>(endpoint: string, formData: FormData) {
        return this.request<T>(endpoint, { method: 'POST', body: formData });
    }
    updateFile<T>(endpoint: string, formData: FormData) {
        return this.request<T>(endpoint, { method: 'PUT', body: formData });
    }
}

export const fileUploadClient = new FileUploadClient();
