export class ApiError extends Error {
  status?: number;
  data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestConfig extends RequestInit {
  data?: any;
  params?: Record<string, string>;
}

export const apiClient = {
  baseURL: '/api/v1',

  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    let url = `${this.baseURL}${endpoint}`;

    if (config.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(config.params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value);
        }
      }
      url += `?${searchParams.toString()}`;
    }

    const headers = new Headers(config.headers || {});
    
    // Auth Interceptor simulation
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (config.data && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const reqInit: RequestInit = {
      ...config,
      headers,
    };

    if (config.data) {
      reqInit.body = JSON.stringify(config.data);
    }

    try {
      const response = await fetch(url, reqInit);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = null;
        }
        throw new ApiError(
          `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      // Check if response has content
      const text = await response.text();
      return text ? JSON.parse(text) : {} as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(error instanceof Error ? error.message : 'Network error');
    }
  },

  get<T>(endpoint: string, config?: Omit<RequestConfig, 'body' | 'method'>) {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  },

  post<T>(endpoint: string, data?: any, config?: Omit<RequestConfig, 'body' | 'method'>) {
    return this.request<T>(endpoint, { ...config, method: 'POST', data });
  },

  put<T>(endpoint: string, data?: any, config?: Omit<RequestConfig, 'body' | 'method'>) {
    return this.request<T>(endpoint, { ...config, method: 'PUT', data });
  },

  delete<T>(endpoint: string, config?: Omit<RequestConfig, 'body' | 'method'>) {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  },
};
