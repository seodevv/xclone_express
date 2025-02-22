import jwt from 'jsonwebtoken';
import multer from 'multer';
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
};

export const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = `${Date.now()}_${file.originalname}`;
    cb(null, fileName);
  },
});

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
