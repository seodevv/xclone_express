import jwt from 'jsonwebtoken';
import fs from 'fs-extra';
import { uploadPath } from '@/app';
import { AdvancedUser } from '@/model/User';
import { CookieOptions } from 'express';
import DAO from '@/lib/DAO';
import { SafeUser } from '@/db/schema';

export const COOKIE_OPTIONS: CookieOptions = {
  maxAge: 1000 * 60 * 60 * 24 * 30,
  httpOnly: true,
  path: '/',
  sameSite: 'none',
  secure: true,
  domain: '.seodevv.com',
};

export const COOKIE_CLEAR_OPTIONS: CookieOptions = {
  maxAge: 0,
  httpOnly: true,
  path: '/',
  sameSite: 'none',
  secure: true,
  domain: '.seodevv.com',
};

export const IMAGE_DEFAULT_PROFILE = 'default_profile.png';
export const IMAGE_DEFAULT_LISTS = 'default_lists.png';

export const generateUserToken = (user: AdvancedUser): string | undefined => {
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const options: jwt.SignOptions = {};
    const token = jwt.sign(
      {
        id: user.id,
        nickname: user.nickname,
        image: user.image,
        verified: user.verified,
      },
      secret,
      options
    );

    return token;
  } catch (err) {
    console.error(err);
    return;
  }
};

export const decodingUserToken = async (
  token: string
): Promise<AdvancedUser | undefined> => {
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const options: jwt.VerifyOptions = {};
    const decode = jwt.verify(token, secret, options) as SafeUser;

    const dao = new DAO();
    const user = await dao.getUser({ id: decode.id });
    dao.release();

    return user;
  } catch (error) {
    console.error(error);
    return;
  }
};

export const encodingString = (string: string) => {
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const options: jwt.SignOptions = {};
    const encoded = jwt.sign(string, secret, options);
    return encoded;
  } catch (error) {
    console.error(error);
    return;
  }
};

export const delay = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const removingFiles = (
  files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[]
) => {
  if (files) {
    if (Array.isArray(files)) {
      Object.values(files).forEach((file: Express.Multer.File) => {
        fs.removeSync(uploadPath + '/' + file.filename);
      });
      return;
    }

    const already: string[] = [];
    Object.values(files).forEach((array) =>
      array.forEach((file) => {
        if (already.includes(file.filename)) return;
        fs.removeSync(uploadPath + '/' + file.filename);
        already.push(file.filename);
      })
    );
  }
};

export const hashString = (str: string) => {
  const salt = 'secret';
  const textToChars = (text: string) =>
    text.split('').map((c) => c.charCodeAt(0));
  const byteHex = (n: number) => ('0' + Number(n).toString(16)).substr(-2);
  const applySaltToChar = (code: number) =>
    textToChars(salt).reduce((a, b) => a ^ b, code);

  return str
    .split('')
    .map((v) => v.charCodeAt(0))
    .map(applySaltToChar)
    .map(byteHex)
    .join('');
};

export const unHashString = (encoded: string) => {
  const salt = 'secret';
  const textToChars = (text: string) =>
    text.split('').map((c) => c.charCodeAt(0));
  const applySaltToChar = (code: number) =>
    textToChars(salt).reduce((a, b) => a ^ b, code);

  return encoded
    .match(/.{1,2}/g)!
    .map((hex) => parseInt(hex, 16))
    .map(applySaltToChar)
    .map((charCode) => String.fromCharCode(charCode))
    .join('');
};

export const encryptRoomId = (senderId: string, receiverId: string) => {
  const a = hashString(senderId);
  const b = hashString(receiverId);
  return [a, b].sort().join('-');
};

export const decryptRoomId = ({
  userid,
  roomid,
}: {
  userid: string;
  roomid: string;
}) => {
  const [a, b] = roomid.split('-');
  const u1 = unHashString(a);
  const u2 = unHashString(b);
  const receiverId = userid === u1 ? u2 : u1;
  return receiverId;
};
