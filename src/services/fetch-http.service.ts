import { IHttpResponseWrapper, IHttpWrapper } from '../interfaces';
import { BaseHttpService } from './base-http.service';
import { BaseLoggerService } from './base-logger.service';

export class FetchHttpService extends BaseHttpService implements IHttpWrapper {
  readonly logPrefix = '[FetchHttp]';

  constructor(private readonly logger: BaseLoggerService) {
    super();
  }

  async get<T = any>(url: string): Promise<IHttpResponseWrapper<T>> {
    this.logger.logAt(5, `${this.logPrefix} GET ${url}`);
    const fetched = await fetch(url);
    const data = await fetched.json();
    const response: IHttpResponseWrapper<T> = {
      data,
      status: fetched.status,
      statusText: fetched.statusText,
    };
    return response;
  }

  async delete<T = any>(url: string): Promise<IHttpResponseWrapper<T>> {
    this.logger.logAt(5, `${this.logPrefix} DELETE ${url}`);
    const fetched = await fetch(url, { method: 'DELETE' });
    const data = await fetched.json();
    const response: IHttpResponseWrapper<T> = {
      data,
      status: fetched.status,
      statusText: fetched.statusText,
    };
    return response;
  }

  async post<T = any>(url: string, payload?: any): Promise<IHttpResponseWrapper<T>> {
    this.logger.logAt(5, `${this.logPrefix} POST ${url}`);
    const fetched = await fetch(url, { method: 'POST', body: payload });
    const data = await fetched.json();
    const response: IHttpResponseWrapper<T> = {
      data,
      status: fetched.status,
      statusText: fetched.statusText,
    };
    return response;
  }

  async put<T = any>(url: string, payload?: any): Promise<IHttpResponseWrapper<T>> {
    this.logger.logAt(5, `${this.logPrefix} PUT ${url}`);
    const fetched = await fetch(url, { method: 'PUT', body: payload });
    const data = await fetched.json();
    const response: IHttpResponseWrapper<T> = {
      data,
      status: fetched.status,
      statusText: fetched.statusText,
    };
    return response;
  }
}
