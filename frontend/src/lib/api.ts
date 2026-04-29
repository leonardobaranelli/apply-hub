import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly raw?: ApiErrorBody,
  ) {
    super(message);
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const data = error.response?.data;
    const status = error.response?.status ?? 500;
    const messageRaw = data?.message;
    const message = Array.isArray(messageRaw)
      ? messageRaw.join(' • ')
      : (messageRaw ?? error.message);

    if (status >= 500) {
      toast.error('Server error', { description: message });
    }
    return Promise.reject(new ApiError(message, status, data));
  },
);

export type Paginated<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
