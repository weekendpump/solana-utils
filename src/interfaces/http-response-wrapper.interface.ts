export interface IHttpResponseWrapper<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  request?: unknown;
}

export interface IHttpWrapper {
  get<T = unknown>(url: string): Promise<IHttpResponseWrapper<T>>;
  delete<T = unknown>(url: string): Promise<IHttpResponseWrapper<T>>;
  post<T = unknown>(url: string, data?: unknown): Promise<IHttpResponseWrapper<T>>;
  put<T = unknown>(url: string, data?: unknown): Promise<IHttpResponseWrapper<T>>;
}
