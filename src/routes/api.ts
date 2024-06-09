import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import apiPostsRouter from './apiRoutes/posts';
import apiUsersRouter from './apiRoutes/users';
import apiHashtagsRouter from './apiRoutes/hashtags';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '../lib/responsesHandlers';
import { uploadPath } from '../index';
import { generateUserToken } from '../lib/common';
import DAO from '@/lib/DAO';

const apiRouter = express.Router();

apiRouter.use('/users', apiUsersRouter);
apiRouter.use('/posts', apiPostsRouter);
apiRouter.use('/hashtags', apiHashtagsRouter);

// "POST /api/login"
// 로그인
apiRouter.post(
  '/login',
  multer().none(),
  (
    req: Request<object, object, { id: string; password: string }>,
    res: Response
  ) => {
    const { id, password } = req.body;
    // body 가 없을 시
    if (!id || !password) return httpBadRequestResponse(res);

    const findUser = new DAO().findUser(id, password);

    // 로그인 성공 시
    if (findUser) {
      const userToken = generateUserToken(findUser);
      if (!userToken) {
        return httpInternalServerErrorResponse(res);
      }
      res.cookie('connect.sid', userToken, {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        path: '/',
      });
      return httpSuccessResponse(res, { findUser, password: undefined });
    }

    // 로그인 실패 시
    return httpUnAuthorizedResponse(res, 'ID, Password is incorrect.');
  }
);

// "POST /api/logout"
// 로그아웃
apiRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('connect.sid');
  return httpCreatedResponse(res, undefined, 'Logout successful');
});

// "GET /api/image/:imageName"
// 이미지 호스팅
apiRouter.get(
  '/image/:imageName',
  (req: Request<{ imageName: string }>, res: Response) => {
    const { imageName } = req.params;
    if (!imageName) return httpBadRequestResponse(res);

    const imagePath = uploadPath + '/' + imageName;
    if (fs.existsSync(imagePath)) {
      return res.status(200).sendFile(imagePath);
    }

    return httpNotFoundResponse(res, 'Image file not found.');
  }
);

export default apiRouter;
