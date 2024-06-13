import { Request } from 'express';
import { Query } from 'express-serve-static-core';
import { ParamsDictionary } from 'express-serve-static-core';

interface TypeCookie extends Record<string, any> {
  'connect.sid'?: string;
}

export interface TypedRequestCookies extends Request {
  cookies: TypeCookie;
}

export interface TypedRequestBody<ReqBody> extends TypedRequestCookies {
  body: ReqBody;
}

export interface TypedRequestQuery<ReqQuery extends Query>
  extends TypedRequestCookies {
  query: ReqQuery;
}

export interface TypedRequestParams<ReqParams extends ParamsDictionary>
  extends TypedRequestCookies {
  params: ReqParams;
}

export interface TypedRequestQueryParams<
  ReqQuery extends Query,
  ReqParams extends ParamsDictionary
> extends TypedRequestCookies {
  query: ReqQuery;
  params: ReqParams;
}

export interface TypedRequestBodyParams<
  ReqBody,
  ReqParams extends ParamsDictionary
> extends TypedRequestCookies {
  body: ReqBody;
  params: ReqParams;
}

export interface TypedRequest<
  ReqQuery extends Query,
  ReqBody,
  ReqParams extends ParamsDictionary
> extends TypedRequestCookies {
  query: ReqQuery;
  body: ReqBody;
  params: ReqParams;
}
