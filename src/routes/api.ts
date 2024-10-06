import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import apiPostsRouter from './apiRoutes/posts';
import apiUsersRouter from './apiRoutes/users';
import apiHashtagsRouter from './apiRoutes/hashtags';
import apiListsRouter from '@/routes/apiRoutes/lists';
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
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
  TypedRequestQuery,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';
import NEW_DAO from '@/lib/dao_n';

const apiRouter = express.Router();

apiRouter.use('/users', apiUsersRouter);
apiRouter.use('/posts', apiPostsRouter);
apiRouter.use('/hashtags', apiHashtagsRouter);
apiRouter.use('/lists', apiListsRouter);

// "GET" /api/login"
// 로그인 아이디 확인
// release
apiRouter.get(
  '/login',
  async (
    req: TypedRequestQuery<{
      type?: string;
      id?: string;
      nickname?: string;
    }>,
    res: TypedResponse<{ message: string }>
  ) => {
    await delay(1000);
    const { type = 'login', id, nickname } = req.query;
    if (!id) return httpBadRequestResponse(res);

    // const dao = new DAO();
    const dao = new NEW_DAO();
    const findUser = await dao.getUser({ id, nickname });
    dao.release();

    switch (type) {
      case 'login':
        return findUser
          ? httpSuccessResponse(res, { message: 'ok' })
          : httpNotFoundResponse(res);
      case 'signup':
        return !findUser
          ? httpSuccessResponse(res, { message: 'ok' })
          : httpForbiddenResponse(res, findUser.id === id ? 'id' : 'nickname');
      default:
        return httpBadRequestResponse(res);
    }
  }
);

// "POST /api/login"
// 로그인
// release
apiRouter.post(
  '/login',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; password?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(1000);
    const { id, password } = req.body;
    // body 가 없을 시
    if (!id || !password) return httpBadRequestResponse(res);

    // const dao = new DAO();
    const dao = new NEW_DAO();
    const findUser = await dao.getUser({ id, password });
    dao.release();

    // 로그인 성공 시
    if (findUser) {
      const userToken = generateUserToken(findUser);
      if (!userToken) {
        return httpInternalServerErrorResponse(res);
      }
      res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
      return httpSuccessResponse(res, { data: findUser });
    }

    // 로그인 실패 시
    return httpForbiddenResponse(res, 'ID, Password is incorrect.');
  }
);

// "POST /api/login/oauth"
// OAuth 로그인
// release
apiRouter.post(
  '/login/oauth',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; nickname?: string; image?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id, nickname, image } = req.body;
    if (!id || !nickname || !image) return httpBadRequestResponse(res);

    // const dao = new DAO();
    const dao = new NEW_DAO();
    let user = await dao.getUser({ id });
    if (!user) {
      user = await dao.createUser({
        id,
        password: encodingString(id) as string,
        nickname,
        image,
        birth: null,
      });
      if (!user) {
        dao.release();
        return httpInternalServerErrorResponse(res);
      }
    }
    dao.release();

    const userToken = generateUserToken(user);
    if (!userToken) {
      return httpInternalServerErrorResponse(res);
    }

    res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
    return httpSuccessResponse(res, { data: user });
  }
);

// "POST /api/logout"
// 로그아웃
// release
apiRouter.post(
  '/logout',
  (req: TypedRequestCookies, res: TypedResponse<{ message: string }>) => {
    res.cookie('connect.sid', '', COOKIE_OPTIONS);
    res.clearCookie('connect.sid');
    return httpSuccessResponse(res, { message: 'Logout successful' });
  }
);

// "GET /api/image/:imageName"
// 이미지 호스팅
// release
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
