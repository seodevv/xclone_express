import { pool } from '@/app';
import { Birth, Schemas, Verified, Where } from '@/db/schema';
import {
  deleteQuery,
  insertQuery,
  insertUsersQuery,
  selectListsQuery,
  selectPostsQuery,
  selectQuery,
  selectUsersQuery,
  updateUsersQuery,
} from '@/lib/query';
import { Follow } from '@/model/Follow';
import { AdvancedLists, ListsDetail } from '@/model/Lists';
import { AdvancedMessages } from '@/model/Message';
import { AdvancedPost } from '@/model/Post';
import { Reactions } from '@/model/Reaction';
import { AdvancedRooms } from '@/model/Room';
import { AdvancedUser } from '@/model/User';
import { PoolClient } from 'pg';

class NEW_DAO {
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
  }) {
    await this.init();
    if (!this.client) return;
    const wheres: Where<Schemas['users']>[][] = [[{ field: 'id', value: id }]];
    let index = 0;
    if (password) {
      wheres[index].push({ field: 'password', value: password });
      index++;
    }
    if (nickname) {
      wheres[index].push({ field: 'nickname', value: nickname, logic: 'OR' });
    }

    const queryConfig = selectUsersQuery({ wheres });

    try {
      const queryResult = (await this.client.query<AdvancedUser>(queryConfig))
        .rows;
      return queryResult[0];
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getUserList({
    q,
  }: {
    q?: string;
  }): Promise<AdvancedUser[] | undefined> {
    await this.init();
    if (!this.client) return;
    const wheres: Where<Schemas['users']>[][] = [];
    let index = 0;
    if (q) {
      wheres[index].push({
        field: 'id',
        operator: '~~',
        value: `%${decodeURIComponent(q)}%`,
      });
      wheres[index].push({
        field: 'nickname',
        operator: '~~',
        value: `%${decodeURIComponent(q)}%`,
        logic: 'OR',
      });
      index++;
    }

    const queryConfig = selectUsersQuery({
      wheres,
      order: [{ field: 'regist' }],
    });

    try {
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
      wheres[index].push({ field: 'source', value: source });
      index++;
    }
    if (target) {
      wheres[index].push({ field: 'target', value: target });
      index++;
    }

    const queryConfig = selectQuery({
      table: 'follow',
      wheres,
    });

    try {
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
    followids,
    postids,
  }: {
    userid?: string;
    parentid?: number;
    originalid?: number;
    quote?: boolean;
    followids?: string[];
    postids?: number[];
  }) {
    await this.init();
    if (!this.client) return;

    const queryConfig = selectPostsQuery({
      userid,
      parentid,
      originalid,
      quote,
      followids,
      postids,
    });

    console.log('[getPostList]\n', queryConfig.text);

    try {
      const postList = (await this.client.query<AdvancedPost>(queryConfig))
        .rows;

      return postList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getLikeList({ userid, postid }: { userid?: string; postid?: number }) {
    await this.init();
    if (!this.client) return;

    const wheres: Where<Schemas['reactions']>[][] = [];
    let index = 0;
    wheres[index].push({ field: 'type', value: 'Heart' });
    index++;
    if (typeof userid !== 'undefined') {
      wheres[index].push({ field: 'userid', value: userid });
      index++;
    }
    if (typeof postid !== 'undefined') {
      wheres[index].push({ field: 'postid', value: postid });
      index++;
    }

    const queryConfig = selectQuery({ table: 'reactions', wheres });
    console.log('[getLikeList]\n', queryConfig.text);

    try {
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
  }: {
    sessionid: string;
    userid?: string;
    make?: Schemas['lists']['make'];
    filter?: 'all' | 'own' | 'memberships';
  }) {
    await this.init();
    if (!this.client) return;

    const queryConfig = selectListsQuery({
      sessionid,
      userid,
      make,
      filter,
    });

    console.log('getListsList', queryConfig.text);

    try {
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
  }) {
    await this.init();
    if (!this.client) return;

    const wheres: Where<Schemas['listsdetail']>[][] = [];
    let index = 0;
    if (typeof type !== 'undefined') {
      wheres[index].push({ field: 'type', value: type });
      index++;
    }
    if (typeof userid !== 'undefined') {
      wheres[index].push({ field: 'userid', value: userid });
      index++;
    }

    const queryConfig = selectQuery({ table: 'listsdetail', wheres });

    try {
      const listsDetailList = (
        await this.client.query<ListsDetail>(queryConfig)
      ).rows;

      return listsDetailList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getRoomsList({
    userid,
    roomid,
  }: {
    userid: string;
    roomid?: string;
  }): Promise<AdvancedRooms[] | undefined> {
    await this.init();
    if (!this.client) return;

    const queryConfig = selectQuery({
      table: 'advancedRooms',
      wheres: [
        [
          { field: 'receiverid', value: userid },
          { field: 'senderid', value: userid, logic: 'OR' },
        ],
        typeof roomid !== 'undefined' ? [{ field: 'id', value: roomid }] : [],
      ],
    });
    console.log('[getRoomList]\n', queryConfig.text);

    try {
      const roomsList = (await this.client.query<AdvancedRooms>(queryConfig))
        .rows;
      return roomsList;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getMessagesList({ roomid }: { roomid: string }) {
    await this.init();
    if (!this.client) return;

    const queryConfig = selectQuery({
      table: 'advancedMessages',
      wheres: [[{ field: 'roomid', value: roomid }]],
      order: [{ field: 'createat', by: 'DESC' }],
    });

    console.log('[getMessagesList]\n', queryConfig.text);

    try {
      const messagesList = (
        await this.client.query<AdvancedMessages>(queryConfig)
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
  >) {
    await this.init();
    if (!this.client) return;

    const insertConfig = insertUsersQuery({
      id,
      password,
      nickname,
      birth,
      image,
    });

    try {
      await this.client.query(insertConfig);
      const user = await this.getUser({ id });
      return user;
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
  }) {
    await this.init();
    if (!this.client) return;
    const updateConfig = updateUsersQuery(config);

    try {
      await this.client.query(updateConfig);
      const user = await this.getUser({ id: config.id });
      return user;
    } catch (error) {
      console.log(error);
      return;
    }
  }

  async deleteBirth({ id }: { id: string }) {
    await this.init();
    if (!this.client) return;

    const updateConfig = updateUsersQuery({ id, birth: null });
    console.log(updateConfig);
    try {
      await this.client.query(updateConfig);
      const user = await this.getUser({ id });
      return user;
    } catch (error) {
      console.log(error);
      return;
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
  }) {
    await this.init();
    if (!this.client) return;

    const selectQueryConfig = selectQuery({
      table: 'follow',
      wheres: [
        [
          { field: 'source', value: source },
          { field: 'target', value: target },
        ],
      ],
    });

    console.log('[followHandler]\n', selectQueryConfig.text);

    try {
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
            console.log(insertQueryConfig.text);
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
            console.log(deleteQueryConfig.text);
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

  async release() {
    this.client?.release();
  }
}

export default NEW_DAO;
