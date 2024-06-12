import { TypedResponse } from '@/model/Response';
import { Response } from 'express';

// HTTP Status Code 20x
// 200 ok
export function httpSuccessResponse<ResBody>(
  res: TypedResponse<{ data?: ResBody; message: string }>,
  data?: ResBody,
  message: string = 'ok'
): TypedResponse<{ data?: ResBody; message: string }> {
  return res.status(200).json({ data, message });
}

// 201 Created
export function httpCreatedResponse<ResBody>(
  res: TypedResponse<{ data?: ResBody; message: string }>,
  data?: ResBody,
  message: string = 'Created'
): TypedResponse<{ data?: ResBody; message: string }> {
  return res.status(201).json({ data, message });
}

// 204 No Content
export function httpNoContentRepsonse(res: Response): Response {
  return res.status(204).send();
}

// Status Code 40x
// 400 Bad Request
export function httpBadRequestResponse(
  res: TypedResponse<{ message: string }>,
  message: string = 'Bad Request'
): TypedResponse<{ message: string }> {
  return res.status(400).json({ message });
}

// 401 Unauthorized
export function httpUnAuthorizedResponse(
  res: TypedResponse<{ message: string }>,
  message: string = 'UnAuthorized'
): TypedResponse<{ message: string }> {
  return res.status(401).json({ message });
}

// 403 Forbidden
export function httpForbiddenResponse(
  res: TypedResponse<{ message: string }>,
  message: string = 'Forbidden'
): TypedResponse<{ message: string }> {
  return res.status(403).json({ message });
}

// 404 Not Found
export function httpNotFoundResponse(
  res: TypedResponse<{ message: string }>,
  message: string = 'Not Found'
): TypedResponse<{ message: string }> {
  return res.status(404).json({ message });
}

// Status Code 50x
// 500 Internal Server Error
export function httpInternalServerErrorResponse(
  res: TypedResponse<{ message: string }>,
  message: string = 'Internal Server Error'
): TypedResponse<{ message: string }> {
  return res.status(500).json({ message });
}
