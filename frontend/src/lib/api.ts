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
    const res = error.response;
    const data = res?.data;
    const messageRaw = data?.message;
    const message = Array.isArray(messageRaw)
      ? messageRaw.join(' • ')
      : (messageRaw ?? error.message);

    if (!res) {
      toast.error('Connection error', {
        description:
          message || 'Could not reach the API. Is the backend running?',
      });
      return Promise.reject(new ApiError(message, 0, data));
    }

    const status = res.status;

    if (status >= 500) {
      toast.error('Server error', { description: message });
    } else if (status >= 400) {
      const title =
        status === 400
          ? 'Invalid request'
          : status === 403
            ? 'Forbidden'
            : status === 404
              ? 'Not found'
              : 'Request failed';
      toast.error(title, { description: message });
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
