import express from 'express';
import {
  httpInternalServerErrorResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { COOKIE_CLEAR_OPTIONS, decodingUserToken } from '@/lib/common';
import { TypedRequestQuery } from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { HashTags } from '@/model/Hashtag';
import DAO from '@/lib/DAO';

const apiHashtagsRouter = express.Router();

// "GET /api/hashtags/trends"
// 상위 트랜드 조회
// ㅇ
apiHashtagsRouter.get(
  '/trends',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: HashTags[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const tagList = await dao.getHashTagList({
      pagination: { limit: pageSize, offset: ~~cursor },
    });
    dao.release();
    if (typeof tagList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: tagList,
      nextCursor: tagList.length === pageSize ? ~~cursor + 1 : undefined,
    });
  }
);

export default apiHashtagsRouter;
