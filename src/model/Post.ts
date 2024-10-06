import { Schemas } from '@/db/schema';

export type Post = Schemas['post'];
export type AdvancedPost = Schemas['advancedPost'];

export interface GifType {
  type: 'gif';
  link: string;
  width: number;
  height: number;
}

export interface ImageType {
  type: 'image';
  fileName: string;
  width: number;
  height: number;
}

export const isScope = (str?: string): Post['scope'] => {
  if (
    str === 'every' ||
    str === 'follow' ||
    str === 'verified' ||
    str === 'only'
  ) {
    return str;
  }
  return 'every';
};
