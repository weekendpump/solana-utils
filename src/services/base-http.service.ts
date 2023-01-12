import { IHttpResponseWrapper, IHttpWrapper } from '../interfaces';

export abstract class BaseHttpService implements IHttpWrapper {
  abstract get<T = unknown>(url: string): Promise<IHttpResponseWrapper<T>>;
  abstract delete<T = unknown>(url: string): Promise<IHttpResponseWrapper<T>>;
  abstract post<T = unknown>(url: string, data?: unknown): Promise<IHttpResponseWrapper<T>>;
  abstract put<T = unknown>(url: string, data?: unknown): Promise<IHttpResponseWrapper<T>>;
}
