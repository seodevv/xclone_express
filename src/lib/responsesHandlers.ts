import { Response } from 'express';

// HTTP Status Code 20x
// 200 ok
export const httpSuccessResponse = <T>(
  res: Response,
  data?: T,
  message: string = 'ok'
): Response<{ data?: T; message: string }> => {
  return res.status(200).json({ data, message });
};

// 201 Created
export const httpCreatedResponse = <T>(
  res: Response,
  data?: T,
  message: string = 'Created'
): Response<{ data?: T; message: string }> => {
  return res.status(201).json({ data, message });
};

// 204 No Content
export const httpNoContentRepsonse = (res: Response) => {
  return res.status(204).send();
};

// Status Code 40x
// 400 Bad Request
export const httpBadRequestResponse = (
  res: Response,
  message: string = 'Bad Request'
): Response<{ message: string }> => {
  return res.status(400).json({ message });
};

// 401 Unauthorized
export const httpUnAuthorizedResponse = (
  res: Response,
  message: string = 'Unauthorized'
): Response<{ message: string }> => {
  return res.status(401).json({ message });
};

// 403 Forbidden
export const httpForbiddenResponse = (
  res: Response,
  message: string = 'Forbidden'
): Response<{ message: string }> => {
  return res.status(403).json({ message });
};

// 404 Not Found
export const httpNotFoundResponse = (
  res: Response,
  message: string = 'Not Found'
): Response<{ message: string }> => {
  return res.status(404).json({ message });
};

// Status Code 50x
// 500 Internal Server Error
export const httpInternalServerErrorResponse = (
  res: Response,
  message: string = 'Internal Server Error'
) => {
  return res.status(500).json({ message });
};
