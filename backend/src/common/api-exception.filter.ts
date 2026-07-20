import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { Response } from "express";

type ErrorBody = {
  code?: string;
  message?: string | string[];
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.normalizeBody(exceptionResponse, status);

    response.status(status).json({
      success: false,
      error: {
        code: body.code,
        message: body.message
      }
    });
  }

  private normalizeBody(exceptionResponse: unknown, status: number): Required<ErrorBody> {
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const candidate = exceptionResponse as ErrorBody;
      const message = Array.isArray(candidate.message)
        ? candidate.message.join("; ")
        : candidate.message;
      return {
        code: candidate.code ?? this.defaultCode(status),
        message: message ?? this.defaultMessage(status)
      };
    }

    if (typeof exceptionResponse === "string") {
      return {
        code: this.defaultCode(status),
        message: exceptionResponse
      };
    }

    return {
      code: this.defaultCode(status),
      message: this.defaultMessage(status)
    };
  }

  private defaultCode(status: number): string {
    if (status === HttpStatus.NOT_FOUND) return "NOT_FOUND";
    if (status === HttpStatus.BAD_REQUEST) return "BAD_REQUEST";
    if (status === HttpStatus.CONFLICT) return "CONFLICT";
    if (status === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
    return "INTERNAL_SERVER_ERROR";
  }

  private defaultMessage(status: number): string {
    if (status === HttpStatus.NOT_FOUND) return "Resource was not found.";
    if (status === HttpStatus.BAD_REQUEST) return "Request validation failed.";
    if (status === HttpStatus.CONFLICT) return "The request conflicts with existing data.";
    if (status === HttpStatus.UNAUTHORIZED) return "Authentication failed.";
    return "An unexpected error occurred.";
  }
}
