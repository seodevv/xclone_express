import express, { CookieOptions } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import apiPostsRouter from './apiRoutes/posts';
import apiUsersRouter from './apiRoutes/users';
import apiHashtagsRouter from './apiRoutes/hashtags';
import {
  httpBadRequestResponse,
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
} from '@/lib/responsesHandlers';
import { uploadPath } from '@/app';
import {
  COOKIE_OPTIONS,
  delay,
  encodingString,
  generateUserToken,
} from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';

const apiRouter = express.Router();

apiRouter.use('/users', apiUsersRouter);
apiRouter.use('/posts', apiPostsRouter);
apiRouter.use('/hashtags', apiHashtagsRouter);

// "POST /api/login"
// 로그인
apiRouter.post(
  '/login',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; password?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(2000);
    const { id, password } = req.body;
    // body 가 없을 시
    if (!id || !password) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser(id, password);

    // 로그인 성공 시
    if (findUser) {
      const userToken = generateUserToken(findUser);
      if (!userToken) {
        return httpInternalServerErrorResponse(res);
      }
      res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
      return httpSuccessResponse(res, findUser);
    }

    // 로그인 실패 시
    return httpForbiddenResponse(res, 'ID, Password is incorrect.');
  }
);

// "POST /api/login/google"
// Google 로그인
apiRouter.post(
  '/login/google',
  multer().none(),
  (
    req: TypedRequestBody<{ id?: string; nickname?: string; image?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id, nickname, image } = req.body;
    if (!id || !nickname || !image) return httpBadRequestResponse(res);

    const dao = new DAO();
    let user = dao.getUser(id);
    if (!user) {
      user = dao.createUser({
        id,
        password: encodingString(id) as string,
        nickname,
        image,
      });
    }

    const userToken = generateUserToken(user);
    if (!userToken) {
      return httpInternalServerErrorResponse(res);
    }

    res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
    return httpSuccessResponse(res, user);
  }
);

// "POST /api/logout"
// 로그아웃
apiRouter.post(
  '/logout',
  (req: TypedRequestCookies, res: TypedResponse<{ message: string }>) => {
    res.cookie('connect.sid', '', {
      maxAge: 0,
      httpOnly: true,
      path: '/',
      sameSite: 'none',
      secure: true,
    });
    return httpSuccessResponse(res, undefined, 'Logout successful');
  }
);

// "GET /api/image/:imageName"
// 이미지 호스팅
apiRouter.get(
  '/image/:imageName',
  (
    req: TypedRequestParams<{ imageName?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { imageName } = req.params;
    if (!imageName) return httpBadRequestResponse(res);

    const imagePath = path.join(uploadPath, `/${imageName}`);
    if (fs.existsSync(imagePath)) {
      return res.status(200).sendFile(imagePath);
    }

    return httpNotFoundResponse(res, 'Image file not found.');
  }
);

export default apiRouter;
