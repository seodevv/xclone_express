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
import { REGEX_NUMBER_ONLY } from '@/lib/regex';

const apiHashtagsRouter = express.Router();

// "GET /api/hashtags/trends"
// 상위 트랜드 조회
apiHashtagsRouter.get(
  '/trends',
  async (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{ data?: HashTags[]; message: string }>
  ) => {
    const { cursor } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const tagList = await dao.getHashTagList();
    dao.release();
    if (!tagList) {
      return httpInternalServerErrorResponse(res);
    }

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = tagList.findIndex((t) => t.id === ~~cursor);
      if (findIndex > -1) {
        tagList.splice(0, findIndex + 1);
      }
    }

    const pageSize = 10;
    const isOver = tagList.length > pageSize;
    if (isOver) {
      tagList.splice(10);
    }

    return httpSuccessResponse(res, {
      data: tagList,
      nextCursor: isOver ? tagList.at(-1)?.id : undefined,
    });
  }
);

export default apiHashtagsRouter;
