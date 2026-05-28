import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private static readonly route5xxHistory = new Map<string, number[]>();
  private static readonly spikeWindowMs = 60_000;
  private static readonly spikeThreshold = 5;

  private buildRouteKey(request: Request) {
    return `${request.method} ${request.path ?? request.url}`;
  }

  private track5xx(routeKey: string) {
    const now = Date.now();
    const cutoff = now - GlobalExceptionFilter.spikeWindowMs;
    const history = GlobalExceptionFilter.route5xxHistory.get(routeKey) ?? [];
    const next = [...history.filter((timestamp) => timestamp >= cutoff), now];
    GlobalExceptionFilter.route5xxHistory.set(routeKey, next);
    return next.length;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const routeKey = this.buildRouteKey(request);
    const stackOrPayload = exception instanceof Error
      ? exception.stack
      : JSON.stringify(exceptionResponse ?? exception);

    this.logger.error(JSON.stringify({
      event: 'http_request_failed',
      severity: status >= 500 ? 'error' : 'warn',
      status,
      method: request.method,
      path: request.path ?? request.url,
      routeKey,
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] ?? null,
      clientIp: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      message: exception instanceof Error ? exception.message : 'Request failed',
      error: stackOrPayload,
    }));

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const count = this.track5xx(routeKey);
      if (count >= GlobalExceptionFilter.spikeThreshold) {
        this.logger.error(JSON.stringify({
          alertType: 'api_5xx_spike',
          severity: 'critical',
          routeKey,
          count,
          windowMs: GlobalExceptionFilter.spikeWindowMs,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json(
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : {
            statusCode: status,
            message:
              exception instanceof HttpException
                ? exception.message
                : 'Internal server error',
          },
    );
  }
}
