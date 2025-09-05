import { GifType, ImageType, Post } from '../model/Post';
import { pool } from '@/app';
import { Birth, PostImage, Schemas, Verified, Where } from '@/db/schema';
import {
  deleteQuery,
  insertQuery,
  insertUsersQuery,
  selectAdvancedRoomListQuery,
  selectListsQuery,
  selectMessagesListSearch,
  selectPostsQuery,
  selectQuery,
  selectRoomsNotification,
  selectUsersQuery,
  updateQuery,
  updateUsersQuery,
} from '@/lib/query';
import { Follow } from '@/model/Follow';
import { HashTags } from '@/model/Hashtag';
import { AdvancedLists, ListsDetail } from '@/model/Lists';
import { AdvancedMessages, MessagesDetail } from '@/model/Message';
import { Morpheme } from '@/model/Morpheme';
import { AdvancedPost } from '@/model/Post';
import { Reactions } from '@/model/Reaction';
import { AdvancedRooms, Room, RoomsNotifications } from '@/model/Room';
import { AdvancedUser, User } from '@/model/User';
import { Views } from '@/model/Views';
import { PoolClient } from 'pg';

class DAO {
  private client: PoolClient | undefined;

  constructor() {}

  async init() {
    if (typeof this.client === 'undefined') {
      this.client = await pool.connect();
    }
  }

  async getUser({
    id,
    password,
    nickname,
  }: {
    id: string;
    password?: string;
    nickname?: string;
  }): Promise<AdvancedUser | undefined> {
    await this.init();
    if (!this.client) return;
    const wheres: Where<Schemas['users']>[][] = [[{ field: 'id', value: id }]];
    let index = 0;
    if (password) {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'password', value: password });
      index++;
    }
    if (nickname) {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'nickname', value: nickname, logic: 'OR' });
    }

    try {
      const queryConfig = selectUsersQuery({ wheres });
      const user = (await this.client.query<AdvancedUser>(queryConfig)).rows[0];
      return user;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getPost({
    postid,
    userid,
  }: {
    postid: Schemas['post']['postid'];
    userid?: Schemas['post']['userid'];
  }): Promise<AdvancedPost | undefined> {
    await this.init();
    if (!this.client) return;

    const where: Where<Schemas['advancedpost']>[] = [
      { field: 'postid', value: postid },
    ];
    if (typeof userid !== 'undefined') {
      where.push({ field: 'userid', value: userid });
    }

    try {
      const selectQueryConfig = selectQuery({
        table: 'advancedpost',
        wheres: [where],
      });
      // console.log('[getPost]\n', selectQueryConfig.text);
      const post = (await this.client.query<AdvancedPost>(selectQueryConfig))
        .rows[0];

      return post;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRepostPost({
    userid,
    originalid,
    quote,
  }: {
    userid: Schemas['post']['userid'];
    originalid: Schemas['post']['originalid'];
    quote: Schemas['post']['quote'];
  }): Promise<Post | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'post',
        wheres: [
          [
            { field: 'userid', value: userid },
            { field: 'originalid', value: originalid },
            { field: 'quote', value: quote },
          ],
        ],
      });
      // console.log('[getRepostPost]\n', queryConfig.text);
      const repost = (await this.client.query<Post>(queryConfig)).rows[0];
      return repost;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getReactions({
    type,
    userid,
    postid,
    commentid,
    quote,
  }: {
    type: Schemas['reactions']['type'];
    userid: Schemas['reactions']['userid'];
    postid: Schemas['reactions']['postid'];
    commentid?: Schemas['reactions']['commentid'];
    quote?: Schemas['reactions']['quote'];
  }): Promise<Reactions | undefined> {
    await this.init();
    if (!this.client) return;
    const where: Where<Schemas['reactions']>[] = [
      { field: 'type', value: type },
      { field: 'userid', value: userid },
      { field: 'postid', value: postid },
    ];
    if (typeof commentid !== 'undefined') {
      where.push({ field: 'commentid', value: commentid });
    }
    if (typeof quote !== 'undefined') {
      where.push({ field: 'quote', value: quote });
    }

    try {
      const queryConfig = selectQuery({ table: 'reactions', wheres: [where] });
      // console.log('[getReactions]\n', queryConfig.text);
      const reaction = (await this.client.query<Reactions>(queryConfig))
        .rows[0];
      return reaction;
    } catch (error) {
      console.error(error);
    }
  }

  async getView({
    postid,
  }: {
    postid: Schemas['views']['postid'];
  }): Promise<Views | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'views',
        wheres: [[{ field: 'postid', value: postid }]],
      });
      // console.log('[getView]\n', queryConfig);
      const view = (await this.client.query<Views>(queryConfig)).rows[0];
      return view;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getLists({
    sessionid,
    id,
    userid,
    make,
  }: {
    sessionid: string;
    id: Schemas['lists']['id'];
    userid?: Schemas['lists']['userid'];
    make?: Schemas['lists']['make'];
  }): Promise<AdvancedLists | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectListsQuery({
        sessionid,
        id,
        userid,
        make,
      });
      // console.log('[getLists]\n', queryConfig.text);
      const lists = (await this.client.query<AdvancedLists>(queryConfig))
        .rows[0];
      return lists;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getListsDetail({
    listid,
    type,
    userid,
    postid,
  }: {
    listid: Schemas['listsdetail']['listid'];
    type: Schemas['listsdetail']['type'];
    userid?: Schemas['listsdetail']['userid'];
    postid?: Schemas['listsdetail']['postid'];
  }): Promise<ListsDetail | undefined> {
    await this.init();
    if (!this.client) return;
    const where: Where<Schemas['listsdetail']>[] = [
      { field: 'listid', value: listid },
      { field: 'type', value: type },
    ];
    if (typeof userid !== 'undefined') {
      where.push({ field: 'userid', value: userid });
    }
    if (typeof postid !== 'undefined') {
      where.push({ field: 'postid', value: postid });
    }

    try {
      const queryConfig = selectQuery({
        table: 'listsdetail',
        wheres: [where],
      });
      const listsDetail = (await this.client.query<ListsDetail>(queryConfig))
        .rows[0];
      return listsDetail;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getHashTag({
    type,
    title,
  }: {
    type: Schemas['hashtags']['type'];
    title: Schemas['hashtags']['title'];
  }): Promise<HashTags | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'hashtags',
        wheres: [
          [
            { field: 'type', value: type },
            {
              field: 'title',
              value: title,
            },
          ],
        ],
      });
      // console.log('[getHashTag]\n', queryConfig.text);
      const hashtag = (await this.client.query<HashTags>(queryConfig)).rows[0];
      return hashtag;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoom({
    roomid,
    senderid,
    receiverid,
    findUserid,
  }: {
    roomid: AdvancedRooms['id'];
    senderid?: AdvancedRooms['senderid'];
    receiverid?: AdvancedRooms['receiverid'];
    findUserid?: string;
  }): Promise<Room | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'rooms',
        wheres: [
          [{ field: 'id', value: roomid }],
          typeof senderid !== 'undefined'
            ? [{ field: 'senderid', value: senderid }]
            : [],
          typeof receiverid !== 'undefined'
            ? [{ field: 'receiverid', value: receiverid }]
            : [],
          typeof findUserid !== 'undefined'
            ? [
                { field: 'senderid', value: findUserid },
                { logic: 'OR', field: 'receiverid', value: findUserid },
              ]
            : [],
        ],
      });
      // console.log('[getRoom]\n', queryConfig.text);
      const room = (await this.client.query<Room>(queryConfig)).rows[0];
      return room;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getAdvancedRoom({
    sessionid,
    roomid,
    senderid,
    receiverid,
    findUserid,
  }: {
    sessionid: string;
    roomid: string;
    senderid?: string;
    receiverid?: string;
    findUserid?: string;
  }): Promise<AdvancedRooms | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectAdvancedRoomListQuery({
        sessionid,
        roomid,
        senderid,
        receiverid,
        findUserid,
      });
      // console.log('[getRoom]\n', queryConfig.text);
      const room = (await this.client.query<AdvancedRooms>(queryConfig))
        .rows[0];
      return room;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getMessage({
    id,
  }: {
    id: Schemas['messages']['id'];
  }): Promise<AdvancedMessages | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'advancedmessages',
        wheres: [[{ field: 'id', value: id }]],
      });
      const message = (await this.client.query<AdvancedMessages>(queryConfig))
        .rows[0];
      return message;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoomsNotification({ sessionid }: { sessionid: AdvancedUser['id'] }) {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectRoomsNotification({
        sessionid,
      });
      const notifications = (
        await this.client.query<RoomsNotifications>(queryConfig)
      ).rows;
      return notifications;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoomsDetail({
    id,
    type,
    roomid,
    userid,
  }: {
    id?: Schemas['roomsdetail']['id'];
    type: Schemas['roomsdetail']['type'];
    roomid: Schemas['roomsdetail']['roomid'];
    userid?: Schemas['roomsdetail']['userid'];
  }): Promise<Schemas['roomsdetail'] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'roomsdetail',
        wheres: [
          [
            { field: 'id', value: id },
            { field: 'type', value: type },
            { field: 'roomid', value: roomid },
            { field: 'userid', value: userid },
          ],
        ],
      });
      // console.log('[getRoomsDetail]\n', queryConfig.text);
      const detail = (
        await this.client.query<Schemas['roomsdetail']>(queryConfig)
      ).rows[0];
      return detail;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoomsSnooze({
    id,
    type,
    userid,
    roomid,
  }: {
    id?: Schemas['roomssnooze']['id'];
    type?: Schemas['roomssnooze']['type'];
    userid: Schemas['roomssnooze']['userid'];
    roomid: Schemas['roomssnooze']['roomid'];
  }): Promise<Schemas['roomssnooze'] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'roomssnooze',
        wheres: [
          [
            { field: 'id', value: id },
            { field: 'type', value: type },
            { field: 'userid', value: userid },
            { field: 'roomid', value: roomid },
          ],
        ],
      });
      const snooze = (
        await this.client.query<Schemas['roomssnooze']>(queryConfig)
      ).rows[0];
      return snooze;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getMessagesdetail({
    type,
    messageid,
    userid,
  }: {
    type: Schemas['messagesdetail']['type'];
    messageid: Schemas['messagesdetail']['messageid'];
    userid: Schemas['messagesdetail']['userid'];
  }): Promise<Schemas['messagesdetail'] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'messagesdetail',
        wheres: [
          [
            { field: 'type', value: type },
            { field: 'messageid', value: messageid },
            { field: 'userid', value: userid },
          ],
        ],
      });
      const detail = (await this.client.query<MessagesDetail>(queryConfig))
        .rows[0];
      return detail;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getUserList({
    q,
    verified,
  }: {
    q?: string;
    verified?: boolean;
  }): Promise<AdvancedUser[] | undefined> {
    await this.init();
    if (!this.client) return;
    const wheres: Where<Schemas['users']>[][] = [];
    if (typeof q !== 'undefined') {
      const where: Where<Schemas['users']>[] = [];
      where.push({
        field: 'id',
        operator: 'ilike',
        value: `%${decodeURIComponent(q)}%`,
      });
      where.push({
        field: 'nickname',
        operator: 'ilike',
        value: `%${decodeURIComponent(q)}%`,
        logic: 'OR',
      });
      wheres.push(where);
    }

    if (typeof verified !== 'undefined') {
      const where: Where<Schemas['users']>[] = [];
      where.push({ field: 'verified', operator: 'is not null' });
      wheres.push(where);
    }

    try {
      const queryConfig = selectUsersQuery({
        wheres,
        order: [{ field: 'regist' }],
      });
      // console.log('[getUserList]\n', queryConfig.text);
      const queryResult = (await this.client.query<AdvancedUser>(queryConfig))
        .rows;
      return queryResult;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getUserListWithIds({
    userids,
  }: {
    userids: string[];
  }): Promise<AdvancedUser[] | undefined> {
    await this.init();
    if (!this.client) return;

    if (userids.length == 0) {
      return [];
    }
    const where: Where<Schemas['users']>[] = [];
    userids.forEach((userid) => {
      where.push({ field: 'id', value: userid, logic: 'OR' });
    });

    try {
      const queryConfig = selectUsersQuery({
        wheres: [where],
        order: [{ field: 'regist' }],
      });
      // console.log('[getUserListWithIds]\n', queryConfig.text);
      const queryResult = (await this.client.query<AdvancedUser>(queryConfig))
        .rows;
      return queryResult;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getFollowList({
    source,
    target,
  }: {
    source?: string;
    target?: string;
  }): Promise<Follow[] | undefined> {
    await this.init();
    if (!this.client) return;
    const wheres: Where<Schemas['follow']>[][] = [];
    let index = 0;
    if (source) {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'source', value: source });
      index++;
    }
    if (target) {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'target', value: target });
      index++;
    }

    try {
      const queryConfig = selectQuery({
        table: 'follow',
        wheres,
      });
      // console.log('[getFollowList]\n', queryConfig.text);
      const queryResult = (await this.client.query<Follow>(queryConfig)).rows;
      return queryResult;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getPostList({
    userid,
    parentid,
    originalid,
    quote,
    filter = 'all',
  }: {
    userid?: string;
    parentid?: number;
    originalid?: number;
    quote?: boolean;
    filter?: 'all' | 'media';
  }): Promise<AdvancedPost[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectPostsQuery({
        userid,
        parentid,
        originalid,
        quote,
        filter,
      });
      // console.log('[getPostList]\n', queryConfig.text);
      const postList = (await this.client.query<AdvancedPost>(queryConfig))
        .rows;

      return postList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getPostListWithIds({
    postids,
    userids,
  }: {
    postids?: number[];
    userids?: string[];
  }): Promise<AdvancedPost[] | undefined> {
    await this.init();
    if (!this.client) return;

    const wheres: Where<Schemas['advancedpost']>[][] = [];
    if (typeof postids !== 'undefined') {
      if (postids.length === 0) {
        return [] as AdvancedPost[];
      }
      const where: Where<Schemas['advancedpost']>[] = [];
      postids.forEach((postid) => {
        where.push({ field: 'postid', value: postid, logic: 'OR' });
      });
      wheres.push(where);
    } else if (typeof userids !== 'undefined') {
      if (userids.length === 0) {
        return [] as AdvancedPost[];
      }
      const where: Where<Schemas['advancedpost']>[] = [];
      userids.forEach((userid) => {
        where.push({ field: 'userid', value: userid, logic: 'OR' });
      });
      wheres.push(where);
    }

    try {
      const queryConfig = selectQuery({ table: 'advancedpost', wheres });
      // console.log('[getPostListWithIds]\n', queryConfig.text);
      const postListWithIds = (
        await this.client.query<AdvancedPost>(queryConfig)
      ).rows;
      return postListWithIds;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getReactionList({
    type,
    postid,
  }: {
    type: Schemas['reactions']['type'];
    postid: Schemas['reactions']['postid'];
  }): Promise<Reactions[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'reactions',
        wheres: [
          [
            { field: 'type', value: type },
            { field: 'postid', value: postid },
          ],
        ],
      });
      // console.log('[getReactionList]\n', queryConfig.text);
      const reactionList = (await this.client.query<Reactions>(queryConfig))
        .rows;
      return reactionList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getBookmarkPostList({
    userid,
  }: {
    userid: Schemas['post']['userid'];
  }): Promise<AdvancedPost[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'advancedpost',
      });

      queryConfig.text += 'WHERE\n';
      queryConfig.text += `\t"Bookmarks"::text like '%"${userid}"%'`;
      // console.log('[getBookmarkPosts]\n', queryConfig.text);
      const postList = (await this.client.query<AdvancedPost>(queryConfig))
        .rows;
      return postList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getLikeList({
    userid,
    postid,
  }: {
    userid?: string;
    postid?: number;
  }): Promise<Reactions[] | undefined> {
    await this.init();
    if (!this.client) return;

    const wheres: Where<Schemas['reactions']>[][] = [
      [{ field: 'type', value: 'Heart' }],
    ];
    if (typeof userid !== 'undefined') {
      wheres[0].push({ field: 'userid', value: userid });
    }
    if (typeof postid !== 'undefined') {
      wheres[0].push({ field: 'postid', value: postid });
    }

    try {
      const queryConfig = selectQuery({ table: 'reactions', wheres });
      // console.log('[getLikeList]\n', queryConfig.text);
      const likeList = (await this.client.query<Reactions>(queryConfig)).rows;
      return likeList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getListsList({
    sessionid,
    userid,
    make,
    filter,
    q,
  }: {
    sessionid: string;
    userid?: string;
    make?: Schemas['lists']['make'];
    filter?: 'all' | 'own' | 'memberships';
    q?: string;
  }): Promise<AdvancedLists[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectListsQuery({
        sessionid,
        userid,
        make,
        filter,
        q,
      });
      // console.log('getListsList', queryConfig.text);

      const listsList = (await this.client.query<AdvancedLists>(queryConfig))
        .rows;
      return listsList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getListsDetailList({
    type,
    userid,
  }: {
    type?: Schemas['listsdetail']['type'];
    userid?: Schemas['listsdetail']['userid'];
  }): Promise<ListsDetail[] | undefined> {
    await this.init();
    if (!this.client) return;

    const wheres: Where<Schemas['listsdetail']>[][] = [];
    let index = 0;
    if (typeof type !== 'undefined') {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'type', value: type });
      index++;
    }
    if (typeof userid !== 'undefined') {
      if (typeof wheres[index] === 'undefined') {
        wheres.push([]);
      }
      wheres[index].push({ field: 'userid', value: userid });
      index++;
    }

    try {
      const queryConfig = selectQuery({ table: 'listsdetail', wheres });
      // console.log('[getListsDetailList]\n', queryConfig.text);
      const listsDetailList = (
        await this.client.query<ListsDetail>(queryConfig)
      ).rows;

      return listsDetailList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getHashTagList(): Promise<HashTags[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectQuery({
        table: 'hashtags',
        order: [{ field: 'count', by: 'DESC' }],
      });
      // console.log('[getHashTagList]\n', queryConfig.text);
      const hashtagList = (await this.client.query(queryConfig)).rows;
      return hashtagList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoomsList({
    sessionid,
    roomid,
    findUserid,
  }: {
    sessionid: string;
    roomid?: string;
    findUserid?: string;
  }): Promise<AdvancedRooms[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectAdvancedRoomListQuery({
        sessionid,
        roomid,
        findUserid,
      });
      // console.log('[getRoomList]\n', queryConfig);
      const roomsList = (await this.client.query<AdvancedRooms>(queryConfig))
        .rows;
      return roomsList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getMessagesList({
    roomid,
    cursor,
    limit,
  }: {
    roomid: string;
    cursor?: number;
    limit?: number;
  }): Promise<AdvancedMessages[] | undefined> {
    await this.init();
    if (!this.client) return;

    const where: Where<AdvancedMessages>[] = [
      { field: 'roomid', value: roomid },
    ];
    if (typeof cursor !== 'undefined' && cursor !== 0) {
      where.push({ logic: 'AND', field: 'id', operator: '<', value: cursor });
    }

    try {
      const queryConfig = selectQuery({
        table: 'advancedmessages',
        wheres: [where],
        order: [{ field: 'createat', by: 'DESC' }],
        limit,
      });
      // console.log('[getMessagesList]\n', queryConfig.text);
      const messagesList = (
        await this.client.query<AdvancedMessages>(queryConfig)
      ).rows;
      return messagesList.reverse();
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getMessagesListSearch({
    sessionid,
    query,
    cursor,
    limit,
  }: {
    sessionid: AdvancedMessages['content'];
    query: AdvancedMessages['content'];
    cursor?: number;
    limit?: number;
  }): Promise<(AdvancedMessages & { Room: AdvancedRooms })[] | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = selectMessagesListSearch({
        sessionid,
        query,
        cursor,
        limit,
      });
      // console.log('[getMessagesListSearch]\n', queryConfig.text);
      const messagesList = (
        await this.client.query<AdvancedMessages & { Room: AdvancedRooms }>(
          queryConfig
        )
      ).rows;
      return messagesList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async createUser({
    id,
    password,
    nickname,
    birth,
    image,
  }: Pick<
    Schemas['users'],
    'id' | 'password' | 'nickname' | 'birth' | 'image'
  >): Promise<AdvancedUser | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = insertUsersQuery({
        id,
        password,
        nickname,
        birth,
        image,
      });
      // console.log('[createUser]\n', queryConfig.text);
      await this.client.query(queryConfig);
      const user = await this.getUser({ id });
      return user;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async createPost({
    userid,
    content = '',
    files,
    media,
    parentid,
    originalid,
    quote,
  }: {
    userid: Schemas['post']['userid'];
    content?: Schemas['post']['content'];
    files?:
      | { [fieldname: string]: Express.Multer.File[] }
      | Express.Multer.File[];
    media?: (GifType | ImageType)[];
    parentid?: Schemas['post']['parentid'];
    originalid?: Schemas['post']['originalid'];
    quote?: Schemas['post']['quote'];
  }): Promise<AdvancedPost | undefined> {
    await this.init();
    if (!this.client) return;

    this.hashtagAnalysis(content);
    this.morphologyAnalysis(content);
    const images: PostImage[] = media
      ? media.map((m, i) => {
          if (m.type === 'gif') {
            return {
              imageId: i + 1,
              link: m.link,
              width: m.width,
              height: m.height,
            };
          }
          const file = files
            ? Object.values(files).find((v) => v.originalname === m.fileName)
            : undefined;
          return {
            imageId: i + 1,
            link: file ? file.filename : '',
            width: m.width,
            height: m.height,
          };
        })
      : [];

    try {
      const queryConfig = insertQuery({
        table: 'post',
        fields: [
          'userid',
          'content',
          'images',
          'parentid',
          'originalid',
          'quote',
        ],
        values: [
          userid,
          content,
          JSON.stringify(images),
          typeof parentid !== 'undefined' ? parentid : null,
          typeof originalid !== 'undefined' ? originalid : null,
          typeof quote !== 'undefined' ? quote : false,
        ],
      });
      // console.log('[createPost]\n', queryConfig);
      const inserted = (await this.client.query<Schemas['post']>(queryConfig))
        .rows[0];
      this.viewsHandler({ postid: inserted.postid, create: true });
      const updatedPost = await this.getPost({ postid: inserted.postid });
      return updatedPost;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async createList({
    sessionid,
    userid,
    name,
    description,
    banner,
    thumbnail,
    make,
  }: {
    sessionid: string;
    userid: Schemas['lists']['userid'];
    name: Schemas['lists']['name'];
    description?: Schemas['lists']['description'];
    banner: Schemas['lists']['banner'];
    thumbnail: Schemas['lists']['thumbnail'];
    make: Schemas['lists']['make'];
  }): Promise<AdvancedLists | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = insertQuery({
        table: 'lists',
        fields: [
          'userid',
          'name',
          'description',
          'banner',
          'thumbnail',
          'make',
        ],
        values: [
          userid,
          name,
          typeof description !== 'undefined' ? description : null,
          banner,
          thumbnail,
          make,
        ],
      });
      // console.log('[createList]\n', queryConfig);
      const inserted = (await this.client.query<Schemas['lists']>(queryConfig))
        .rows[0];
      const createLists = await this.getLists({ sessionid, id: inserted.id });
      return createLists;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async createRoom({
    sessionid,
    roomid,
    senderid,
    receiverid,
  }: {
    sessionid: string;
    roomid: string;
    senderid: string;
    receiverid: string;
  }): Promise<AdvancedRooms | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = insertQuery({
        table: 'rooms',
        fields: ['id', 'senderid', 'receiverid'],
        values: [roomid, senderid, receiverid],
      });
      // console.log('[createRoom]\n', queryConfig);
      const inserted = (await this.client.query<Schemas['rooms']>(queryConfig))
        .rows[0];
      const createRoom = await this.getAdvancedRoom({
        sessionid,
        roomid: inserted.id,
      });
      return createRoom;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async createMessage({
    roomid,
    senderid,
    content,
    parentid,
  }: {
    roomid: Schemas['messages']['roomid'];
    senderid: Schemas['messages']['senderid'];
    content: Schemas['messages']['content'];
    parentid: Schemas['messages']['parentid'];
  }) {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = insertQuery({
        table: 'messages',
        fields: ['roomid', 'senderid', 'content', 'parentid'],
        values: [roomid, senderid, content, parentid],
      });
      // console.log('[createMessage]\n', queryConfig);
      const inserted = (
        await this.client.query<Schemas['messages']>(queryConfig)
      ).rows[0];
      const createdMessage = await this.getMessage({ id: inserted.id });
      return createdMessage;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async updateUser(config: {
    id: string;
    nickname?: string;
    desc?: string;
    location?: string;
    birth?: Birth;
    refer?: string;
    image?: string;
    banner?: string;
    verified?: Verified;
  }): Promise<AdvancedUser | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = updateUsersQuery(config);
      // console.log('[updateUser]\n', queryConfig.text);
      await this.client.query(queryConfig);
      const updateUser = await this.getUser({ id: config.id });
      return updateUser;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async updatePassword({ id, password }: { id: string; password: string }) {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = updateQuery({
        table: 'users',
        update: { fields: ['password'], values: [password] },
        wheres: [[{ field: 'id', value: id }]],
      });
      // console.log(queryConfig.text);
      await this.client.query(queryConfig);
      const updatedUser = await this.getUser({ id });
      return updatedUser;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async updatePost({
    postid,
    userid,
    content,
    images,
    pinned,
    scope,
  }: {
    postid: Schemas['post']['postid'];
    userid: Schemas['post']['userid'];
    content?: Schemas['post']['content'];
    images?: Schemas['post']['images'];
    pinned?: Schemas['post']['pinned'];
    scope?: Schemas['post']['scope'];
  }): Promise<AdvancedPost | undefined> {
    await this.init();
    if (!this.client) return;
    const update: { fields: (keyof Schemas['post'])[]; values: any[] } = {
      fields: [],
      values: [],
    };

    if (typeof content !== 'undefined') {
      update.fields.push('content');
      update.values.push(content);
    }
    if (typeof images !== 'undefined') {
      update.fields.push('images');
      update.values.push(JSON.stringify(images));
    }
    if (typeof pinned !== 'undefined') {
      update.fields.push('pinned');
      update.values.push(pinned);
    }
    if (typeof scope !== 'undefined') {
      update.fields.push('scope');
      update.values.push(scope);
    }

    if (update.fields.length === 0 || update.values.length === 0) {
      throw Error('The fields and values​ to be updated are empty.');
    }

    try {
      const queryConfig = updateQuery({
        table: 'post',
        update,
        wheres: [
          [
            { field: 'postid', value: postid },
            { field: 'userid', value: userid },
          ],
        ],
      });
      // console.log('[updatePost]\n', queryConfig.text);
      await this.client.query(queryConfig);
      const updatedPost = await this.getPost({ userid, postid });
      return updatedPost;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async updateLists({
    id,
    userid,
    name,
    description,
    banner,
    thumbnail,
    make,
  }: {
    id: Schemas['lists']['id'];
    userid: Schemas['lists']['userid'];
    name?: Schemas['lists']['name'];
    description?: Schemas['lists']['description'];
    banner?: Schemas['lists']['banner'];
    thumbnail?: Schemas['lists']['thumbnail'];
    make?: Schemas['lists']['make'];
  }): Promise<AdvancedLists | undefined> {
    await this.init();
    if (!this.client) return;
    const update: { fields: (keyof Schemas['lists'])[]; values: any[] } = {
      fields: [],
      values: [],
    };
    if (typeof name !== 'undefined') {
      update.fields.push('name');
      update.values.push(name);
    }
    if (typeof description !== 'undefined') {
      update.fields.push('description');
      update.values.push(description !== '' ? description : null);
    }
    if (typeof banner !== 'undefined') {
      update.fields.push('banner');
      update.values.push(banner);
    }
    if (typeof thumbnail !== 'undefined') {
      update.fields.push('thumbnail');
      update.values.push(thumbnail);
    }
    if (typeof make !== 'undefined') {
      update.fields.push('make');
      update.values.push(make);
    }

    try {
      const queryConfig = updateQuery({
        table: 'lists',
        update,
        wheres: [
          [
            { field: 'id', value: id },
            { field: 'userid', value: userid },
          ],
        ],
      });
      // console.log('[updateLists]\n', queryConfig.text);
      await this.client.query(queryConfig);
      const updatedLists = await this.getLists({
        sessionid: userid,
        id,
        userid: userid,
      });
      return updatedLists;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async updateSeen({
    roomid,
    sessionid,
  }: {
    roomid: Schemas['messages']['roomid'];
    sessionid: User['id'];
  }): Promise<AdvancedRooms | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = updateQuery({
        table: 'messages',
        update: {
          fields: ['seen'],
          values: [true],
        },
        wheres: [
          [
            { field: 'roomid', value: roomid },
            {
              logic: 'AND',
              field: 'senderid',
              operator: '<>',
              value: sessionid,
            },
          ],
        ],
      });
      // console.log('[updateSeen]\n', queryConfig.text);
      await this.client.query(queryConfig);

      return await this.getAdvancedRoom({
        sessionid,
        roomid,
        findUserid: sessionid,
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async deleteBirth({ id }: { id: string }): Promise<AdvancedUser | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = updateUsersQuery({ id, birth: null });
      // console.log(queryConfig);
      await this.client.query(queryConfig);
      const user = await this.getUser({ id });
      return user;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async deletePost({
    postid,
    postids,
  }: {
    postid?: Schemas['post']['postid'];
    postids?: Schemas['post']['postid'][];
  }): Promise<boolean | undefined> {
    await this.init();
    if (!this.client) return false;

    const where: Where<Schemas['post']>[] = [];
    if (typeof postids !== 'undefined') {
      if (postids.length === 0) {
        return false;
      }
      postids.forEach((id) => {
        where.push({ field: 'postid', value: id, logic: 'OR' });
      });
    } else if (typeof postid !== 'undefined') {
      where.push({ field: 'postid', value: postid });
    } else {
      return false;
    }

    try {
      const queryConfig = deleteQuery({
        table: 'post',
        wheres: [where],
      });
      // console.log('[deletePost]\n', queryConfig.text);
      await this.client.query(queryConfig);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async deleteLists({
    id,
  }: {
    id: Schemas['lists']['id'];
  }): Promise<boolean | undefined> {
    await this.init();
    if (!this.client) return false;

    try {
      const queryConfig = deleteQuery({
        table: 'lists',
        wheres: [[{ field: 'id', value: id }]],
      });
      // console.log('[deleteLists]\n', queryConfig.text);
      await this.client.query(queryConfig);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async disableMessage({
    messageid,
    userid,
  }: {
    messageid: Schemas['messagesdetail']['messageid'];
    userid: Schemas['messagesdetail']['userid'];
  }) {
    await this.init();
    if (!this.client) return false;

    try {
      const queryConfig = insertQuery({
        table: 'messagesdetail',
        fields: ['type', 'messageid', 'userid'],
        values: ['disable', messageid, userid],
      });
      // console.log(`[disableMessage]\n`, queryConfig.text);
      await this.client.query(queryConfig);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async followHandler({
    type,
    source,
    target,
  }: {
    type: 'follow' | 'unfollow';
    source: string;
    target: string;
  }): Promise<AdvancedUser | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const selectQueryConfig = selectQuery({
        table: 'follow',
        wheres: [
          [
            { field: 'source', value: source },
            { field: 'target', value: target },
          ],
        ],
      });
      // console.log('[followHandler]\n', selectQueryConfig.text);
      const isFollow = (await this.client.query<Follow>(selectQueryConfig))
        .rows[0];

      switch (type) {
        case 'follow':
          if (!isFollow) {
            const insertQueryConfig = insertQuery({
              table: 'follow',
              fields: ['source', 'target'],
              values: [source, target],
            });
            // console.log(insertQueryConfig.text);
            await this.client.query(insertQueryConfig);
          }
          break;
        case 'unfollow':
          if (isFollow) {
            const deleteQueryConfig = deleteQuery({
              table: 'follow',
              wheres: [
                [
                  { field: 'source', value: source },
                  { field: 'target', value: target },
                ],
              ],
            });
            // console.log(deleteQueryConfig.text);
            await this.client.query(deleteQueryConfig);
          }
      }

      const updatedUser = await this.getUser({ id: target });
      return updatedUser;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async reactionHandler({
    type,
    method,
    userid,
    postid,
    commentid,
    quote,
  }: {
    type: Schemas['reactions']['type'];
    method: 'post' | 'delete';
    userid: string;
    postid: number;
    commentid?: number;
    quote?: boolean;
  }): Promise<AdvancedPost | undefined> {
    await this.init();
    if (!this.client) return;

    const isReaction = await this.getReactions({
      type,
      userid,
      postid,
      commentid,
      quote,
    });

    try {
      switch (method) {
        case 'post': {
          if (!isReaction) {
            const fields: (keyof Schemas['reactions'])[] = [
              'type',
              'userid',
              'postid',
            ];
            const values: any[] = [type, userid, postid];
            if (typeof commentid !== 'undefined') {
              fields.push('commentid');
              values.push(commentid);
            }
            if (typeof quote !== 'undefined') {
              fields.push('quote');
              values.push(quote);
            }
            const insertQueryConfig = insertQuery({
              table: 'reactions',
              fields,
              values,
            });
            // console.log('[reactionHandler][post]\n', insertQueryConfig.text);

            await this.client.query(insertQueryConfig);
            break;
          }
        }
        case 'delete': {
          if (isReaction) {
            const where: Where<Schemas['reactions']>[] = [
              { field: 'type', value: type },
              { field: 'userid', value: userid },
              { field: 'postid', value: postid },
            ];
            if (typeof commentid !== 'undefined') {
              where.push({ field: 'commentid', value: commentid });
            }
            if (typeof quote !== 'undefined') {
              where.push({ field: 'quote', value: quote });
            }

            const deleteQueryConfig = deleteQuery({
              table: 'reactions',
              wheres: [where],
            });
            // console.log('[reactionHandler][delete]\n', deleteQueryConfig.text);

            await this.client.query(deleteQueryConfig);
          }
          break;
        }
      }

      const updatedPost = await this.getPost({ postid });
      return updatedPost;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async viewsHandler({
    postid,
    key,
    create,
  }: {
    postid: Schemas['views']['postid'];
    key?: keyof Omit<Schemas['views'], 'postid'>;
    create?: boolean;
  }): Promise<AdvancedPost | undefined> {
    await this.init();
    if (!this.client) return;

    const findView = await this.getView({ postid });
    try {
      if (findView) {
        const updateQueryConfig = updateQuery({
          table: 'views',
          update: {
            fields: [typeof key !== 'undefined' ? key : 'impressions'],
            values: [
              typeof key !== 'undefined'
                ? findView[key] + 1
                : findView.impressions + 1,
            ],
          },
          wheres: [[{ field: 'postid', value: findView.postid }]],
        });
        // console.log('[viewsHandler][update]\n', updateQueryConfig.text);
        await this.client.query(updateQueryConfig);
      } else {
        const insertQueryConfig = insertQuery({
          table: 'views',
          fields: ['postid', 'impressions'],
          values: [postid, create ? 0 : 1],
        });
        // console.log('[viewsHandler][insert]\n', insertQueryConfig.text);
        await this.client.query(insertQueryConfig);
      }

      const updatedPost = await this.getPost({ postid });
      return updatedPost;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async listsDetailHandler({
    method,
    listid,
    type,
    userid,
    postid,
  }: {
    method: 'post' | 'delete';
    listid: Schemas['listsdetail']['listid'];
    type: Schemas['listsdetail']['type'];
    userid: Schemas['listsdetail']['userid'];
    postid?: Schemas['listsdetail']['postid'];
  }): Promise<boolean | undefined> {
    await this.init();
    if (!this.client) return false;

    try {
      switch (method) {
        case 'post': {
          const queryConfig = insertQuery({
            table: 'listsdetail',
            fields: ['listid', 'type', 'userid', 'postid'],
            values: [
              listid,
              type,
              userid,
              typeof postid !== 'undefined' ? postid : null,
            ],
          });
          // console.log('[listsDetailHandler][post]\n', queryConfig.text);
          await this.client.query(queryConfig);
          return true;
        }
        case 'delete': {
          const queryConfig = deleteQuery({
            table: 'listsdetail',
            wheres: [
              [
                { field: 'listid', value: listid },
                { field: 'userid', value: userid },
                { field: 'type', value: type },
              ],
            ],
          });
          // console.log('[listsDetailHandler][delete]\n', queryConfig.text);
          await this.client.query(queryConfig);
          return true;
        }
        default: {
          throw new Error('An incorrect method argument was entered.');
        }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async roomsDetailHandler({
    method,
    type,
    userid,
    roomid,
  }: {
    method: 'post' | 'delete';
    type: Schemas['roomsdetail']['type'];
    userid?: Schemas['roomsdetail']['userid'];
    roomid: Schemas['roomsdetail']['roomid'];
  }): Promise<boolean | undefined> {
    await this.init();
    if (!this.client) return;

    try {
      const check = await this.getRoomsDetail({
        type,
        userid,
        roomid,
      });

      switch (method) {
        case 'post': {
          if (typeof check !== 'undefined') {
            return false;
          }

          const queryConfig = insertQuery({
            table: 'roomsdetail',
            fields: ['type', 'userid', 'roomid'],
            values: [type, userid, roomid],
          });

          await this.client.query(queryConfig);
          return true;
        }
        case 'delete': {
          if (typeof check === 'undefined') {
            return false;
          }

          const queryConfig = deleteQuery({
            table: 'roomsdetail',
            wheres: [
              [
                { field: 'type', value: type },
                { field: 'userid', value: userid },
                { field: 'roomid', value: roomid },
              ],
            ],
          });
          await this.client.query(queryConfig);
          return true;
        }
      }
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async roomsSnoozeHandler({
    method,
    type,
    userid,
    roomid,
  }: {
    method: 'post' | 'delete';
    type?: Schemas['roomssnooze']['type'];
    userid: Schemas['roomssnooze']['userid'];
    roomid: Schemas['roomssnooze']['roomid'];
  }) {
    await this.init();
    if (!this.client) return;

    try {
      const check = await this.getRoomsSnooze({
        userid,
        roomid,
      });

      switch (method) {
        case 'post': {
          if (typeof type === 'undefined') return false;
          if (typeof check === 'undefined') {
            const insertQueryConfig = insertQuery({
              table: 'roomssnooze',
              fields: ['type', 'userid', 'roomid'],
              values: [type, userid, roomid],
            });

            await this.client.query(insertQueryConfig);
            return true;
          }

          const updateQueryConfig = updateQuery({
            table: 'roomssnooze',
            update: {
              fields: ['type', 'createat'],
              values: [type, new Date()],
            },
            wheres: [
              [
                { field: 'userid', value: userid },
                { field: 'roomid', value: roomid },
              ],
            ],
          });
          // console.log('[roomsSnoozeHandler]\n', updateQueryConfig.text);
          await this.client.query(updateQueryConfig);
          return true;
        }
        case 'delete': {
          if (typeof check === 'undefined') return false;

          const deleteQueryConfig = deleteQuery({
            table: 'roomssnooze',
            wheres: [
              [
                { field: 'userid', value: userid },
                { field: 'roomid', value: roomid },
              ],
            ],
          });
          await this.client.query(deleteQueryConfig);
          return true;
        }
      }
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async messagesDetailHandler({
    type,
    payload,
  }: {
    type: 'disable' | 'addReact' | 'updateReact' | 'removeReact';
    payload: {
      messageid: Schemas['messagesdetail']['messageid'];
      userid: Schemas['messagesdetail']['userid'];
      content?: Schemas['messagesdetail']['content'];
    };
  }) {
    await this.init();
    if (!this.client) return false;

    try {
      switch (type) {
        case 'disable': {
          const queryConfig = insertQuery({
            table: 'messagesdetail',
            fields: ['type', 'messageid', 'userid'],
            values: ['disable', payload.messageid, payload.userid],
          });
          // console.log('[disable]\n', queryConfig.text);
          const result = await this.client.query(queryConfig);
          return true;
        }
        case 'addReact': {
          if (!payload.content) throw new Error('content is not null');
          const queryConfig = insertQuery({
            table: 'messagesdetail',
            fields: ['type', 'messageid', 'userid', 'content'],
            values: [
              'react',
              payload.messageid,
              payload.userid,
              payload.content,
            ],
          });
          // console.log('[addReact]\n', queryConfig.text);
          await this.client.query(queryConfig);
          return true;
        }
        case 'updateReact': {
          const queryConfig = updateQuery({
            table: 'messagesdetail',
            update: {
              fields: ['content'],
              values: [payload.content],
            },
            wheres: [
              [
                { field: 'type', value: 'react' },
                { field: 'messageid', value: payload.messageid },
                { field: 'userid', value: payload.userid },
              ],
            ],
          });
          // console.log('[updateReact]\n', queryConfig.text);
          await this.client.query(queryConfig);
          return true;
        }
        case 'removeReact': {
          const select = await this.getMessagesdetail({
            type: 'react',
            messageid: payload.messageid,
            userid: payload.userid,
          });
          if (!select) throw new Error('data not found');

          const queryConfig = deleteQuery({
            table: 'messagesdetail',
            wheres: [
              [
                { field: 'type', value: 'react' },
                { field: 'messageid', value: payload.messageid },
                { field: 'userid', value: payload.userid },
              ],
            ],
          });
          // console.log('[removeReact]\n', queryConfig.text);
          await this.client.query(queryConfig);
          return true;
        }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async messagesMediaHandler({
    type,
    messageid,
    url,
    width,
    height,
  }: {
    type: Schemas['messagesmedia']['type'];
    messageid: Schemas['messagesmedia']['messageid'];
    url: Schemas['messagesmedia']['url'];
    width: Schemas['messagesmedia']['width'];
    height: Schemas['messagesmedia']['height'];
  }) {
    await this.init();
    if (!this.client) return;

    try {
      const queryConfig = insertQuery({
        table: 'messagesmedia',
        fields: ['type', 'messageid', 'url', 'width', 'height'],
        values: [type, messageid, url, width, height],
      });
      // console.log('[messagesMediaHandler]\n', queryConfig.text);
      await this.client.query(queryConfig);
      return await this.getMessage({ id: messageid });
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async hashtagAnalysis(content: string): Promise<void> {
    await this.init();
    if (!this.client) return;
    if (!content || !content.trim()) return;

    const regex = /#[^\s#)\]]+/g;
    const hashtags = content.match(regex);
    if (hashtags) {
      const already: string[] = [];
      for (let t of hashtags) {
        const tag = t.replace(/#/, '');
        if (tag === '') continue;
        if (already.includes(t)) continue;

        const findTag = await this.getHashTag({ type: 'tag', title: tag });

        try {
          if (findTag) {
            const updateQueryConfig = updateQuery({
              table: 'hashtags',
              update: { fields: ['count'], values: [findTag.count + 1] },
              wheres: [
                [
                  { field: 'type', value: findTag.type },
                  { field: 'title', value: findTag.title },
                ],
              ],
            });
            // console.log('[hashtagAnalysis]\n', updateQueryConfig.text);

            this.client.query(updateQueryConfig);
          } else {
            const insertQueryConfig = insertQuery({
              table: 'hashtags',
              fields: ['type', 'title'],
              values: ['tag', tag],
            });

            // console.log('[hashtagAnalysis]\n', insertQueryConfig.text);

            this.client.query(insertQueryConfig);
          }
        } catch (error) {
          console.error(error);
          continue;
        } finally {
          already.push(t);
        }
      }
    }
  }

  async morphologyAnalysis(content: string): Promise<void> {
    await this.init();
    if (!this.client) return;
    const API_URL = process.env.AI_OPEN_ETRI_API_URL;
    const API_KEY = process.env.AI_OPEN_ETRI_API_KEY;
    if (!content || !content.trim() || !API_URL || !API_KEY) return;

    try {
      const requestOptions: RequestInit = {
        method: 'POST',
        body: JSON.stringify({
          argument: {
            analysis_code: 'morp',
            text: content,
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: API_KEY,
        },
      };

      const response = await fetch(API_URL, requestOptions);
      if (!response.ok) {
        throw new Error('Failed to fetch data from AI_OPEN_ETRI_API');
      }

      const data: Morpheme = await response.json();
      const already: string[] = [];
      for (let sentence of data.return_object.sentence) {
        for (let morp of sentence.morp) {
          try {
            if (!['NNG', 'NNP', 'NNB', 'SL'].includes(morp.type)) return;
            if (already.includes(morp.lemma.toLowerCase())) return;
            const findWord = await this.getHashTag({
              type: 'word',
              title: morp.lemma,
            });

            if (findWord) {
              const updateQueryConfig = updateQuery({
                table: 'hashtags',
                update: { fields: ['count'], values: [findWord.count + 1] },
                wheres: [
                  [
                    { field: 'type', value: findWord.type },
                    { field: 'title', value: findWord.title },
                  ],
                ],
              });
              // console.log('[morphologyAnalysis]\n', updateQueryConfig.text);
              this.client.query(updateQueryConfig);
            } else {
              const insertQueryConfig = insertQuery({
                table: 'hashtags',
                fields: ['type', 'title', 'weight'],
                values: ['word', morp.lemma, morp.weight],
              });
              // console.log('[morphologyAnalysis]\n', insertQueryConfig.text);
              this.client.query(insertQueryConfig);
            }
          } catch (error) {
            console.error(error);
            continue;
          }
        }
      }
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async release() {
    this.client?.release();
  }
}

export default DAO;
