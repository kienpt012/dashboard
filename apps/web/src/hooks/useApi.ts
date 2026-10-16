import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { errorText, http } from '@/lib/api';

// Mỗi truy vấn được khoá theo chính đường dẫn API; làm mới theo tiền tố đường dẫn sau mỗi thao tác ghi.

type Options = { enabled?: boolean; refetchInterval?: number | false; keepPrevious?: boolean; staleTime?: number };

export function useApi<T>(path: string | null | undefined, options: Options = {}) {
  return useQuery({
    queryKey: [path],
    queryFn: ({ signal }) => http.get<T>(path!, signal),
    enabled: Boolean(path) && options.enabled !== false,
    refetchInterval: options.refetchInterval,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    staleTime: options.staleTime,
  });
}

export function invalidate(client: QueryClient, prefixes: string[]) {
  return client.invalidateQueries({
    predicate: query => {
      const key = query.queryKey[0];
      return typeof key === 'string' && prefixes.some(prefix => key.startsWith(prefix));
    },
  });
}

type ActionOptions<TResult> = {
  /** Thông báo khi thành công; bỏ trống thì không báo. */
  success?: string | ((result: TResult) => string);
  /** Tiền tố đường dẫn cần tải lại sau khi ghi. */
  refresh?: string[];
  onDone?: (result: TResult) => void;
};

/** Thao tác ghi: báo lỗi tiếng Việt, báo thành công, làm mới dữ liệu liên quan. */
export function useAction<TInput = void, TResult = unknown>(run: (input: TInput) => Promise<TResult>, options: ActionOptions<TResult> = {}) {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: run,
    onSuccess: async result => {
      if (options.refresh?.length) await invalidate(client, options.refresh);
      const text = typeof options.success === 'function' ? options.success(result) : options.success;
      if (text) message.success(text);
      options.onDone?.(result);
    },
    onError: error => {
      message.error(errorText(error));
    },
  });
}
