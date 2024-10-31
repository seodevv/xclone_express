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
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { uploadPath } from '@/app';
import {
  COOKIE_CLEAR_OPTIONS,
  COOKIE_OPTIONS,
  decodingUserToken,
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
import DAO from '@/lib/DAO';

const apiRouter = express.Router();

apiRouter.use('/users', apiUsersRouter);
apiRouter.use('/posts', apiPostsRouter);
apiRouter.use('/hashtags', apiHashtagsRouter);
apiRouter.use('/lists', apiListsRouter);

// "GET" /api/login"
// 로그인 아이디 확인
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

    const dao = new DAO();
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

    const dao = new DAO();
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
apiRouter.post(
  '/login/oauth',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; nickname?: string; image?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id, nickname, image } = req.body;
    if (!id || !nickname || !image) return httpBadRequestResponse(res);

    const dao = new DAO();
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
apiRouter.post(
  '/logout',
  (req: TypedRequestCookies, res: TypedResponse<{ message: string }>) => {
    res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
    return httpSuccessResponse(res, { message: 'Logout successful' });
  }
);

// "POST /api/confirm"
// 패스워드 체크
apiRouter.post(
  '/confirm',
  async (
    req: TypedRequestBody<{ password?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(1000);
    const password = req.body.password;
    const { 'connect.sid': token } = req.cookies;
    if (!password) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      res.clearCookie('connect.sid', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const checkUser = await dao.getUser({ id: currentUser.id, password });
    dao.release();
    if (checkUser) {
      return httpSuccessResponse(res, { data: checkUser });
    } else {
      return httpNotFoundResponse(res);
    }
  }
);

// "POST /api/password"
// 패스워드 변경
apiRouter.post(
  '/password',
  async (
    req: TypedRequestBody<{ password?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const password = req.body.password;
    const { 'connect.sid': token } = req.cookies;
    if (!password) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const updatedUser = await dao.updatePassword({
      id: currentUser.id,
      password,
    });
    return httpSuccessResponse(res, {});
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
