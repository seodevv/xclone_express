import { QueryConfig } from 'pg';

export type Birth = {
  date: string;
  scope: {
    month: 'public' | 'follower' | 'following' | 'each' | 'only';
    year: 'public' | 'follower' | 'following' | 'each' | 'only';
  };
};

export type Verified = {
  type: 'blue' | 'gold' | 'gray';
  date: Date;
};

export type UserId = { id: Schemas['users']['id'] };

export type SafeUser = Pick<
  Schemas['users'],
  'id' | 'nickname' | 'image' | 'verified'
>;

export type PostImage = {
  imageId: number;
  link: string;
  width: number;
  height: number;
};

export interface Schemas {
  users: {
    id: string;
    password: string;
    nickname: string;
    image: string;
    banner: string | null;
    desc: string | null;
    location: string | null;
    birth: Birth | null;
    verified: Verified | null;
    refer: string | null;
    regist: Date;
  };
  follow: {
    id: number;
    source: string;
    target: string;
    createat: Date;
  };
  reactions: {
    id: number;
    type: 'Heart' | 'Repost' | 'Comment' | 'Bookmark';
    postid: number;
    commentid: number | null;
    userid: string;
    quote: boolean | null;
  };
  post: {
    postid: number;
    userid: string;
    content: string;
    images: PostImage[];
    createat: Date;
    parentid: number | null;
    originalid: number | null;
    quote: boolean;
    pinned: boolean;
    scope: 'every' | 'follow' | 'verified' | 'only';
  };
  advancedPost: Schemas['post'] & {
    User: SafeUser;
    Parent: {
      postid: number;
      User: SafeUser;
      images: PostImage[];
    } | null;
    Original: Schemas['advancedPost'] | null;
    Hearts: UserId[];
    Reposts: UserId[];
    Comments: UserId[];
    Bookmarks: UserId[];
    _count: {
      Hearts: number;
      Reposts: number;
      Comments: number;
      Bookmarks: number;
      Views: number;
    };
  };
  views: {
    postid: number;
    impressions: number;
    engagements: number;
    detailexpands: number;
    newfollowers: number;
    profilevisit: number;
  };
  hashtags: {
    type: 'tag' | 'word';
    title: string;
    count: number;
    weight: number;
  };
  lists: {
    id: number;
    userid: string;
    name: string;
    description: string | null;
    banner: string;
    thumbnail: string;
    make: 'private' | 'public';
    createat: Date;
  };
  listsdetail: {
    id: number;
    listid: number;
    type: 'member' | 'post' | 'unpost' | 'follower' | 'pinned' | 'unshow';
    userid: string;
    postid: number | null;
  };
  rooms: {
    id: string;
    receiverid: string;
    senderid: string;
    createat: Date;
    lastmessageid: number | null;
  };
  messages: {
    id: number;
    roomid: string;
    senderid: string;
    content: string;
    createat: Date;
  };
}

export type Operator =
  | '<'
  | '<='
  | '<>'
  | '='
  | '>'
  | '>='
  | 'in'
  | 'not in'
  | '~~'
  | '!~~';

export type Field<TableSchema> = keyof TableSchema;

export interface Where<TableSchema> {
  field: keyof TableSchema;
  operator?: Operator;
  value: any;
  logic?: 'AND' | 'OR';
}

export interface Order<TableSchema> {
  field: keyof TableSchema;
  by?: 'ASC' | 'DESC';
}

export type RequiredQueryConfig = Required<
  Pick<QueryConfig, 'text' | 'values'>
>;
