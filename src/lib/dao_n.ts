import { pool } from '@/app';
import { Birth, Schemas, Verified, Where } from '@/db/schema';
import {
  insertUsersQuery,
  selectQuery,
  selectUsersQuery,
  updateUsersQuery,
} from '@/lib/query';
import { Follow } from '@/model/Follow';
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
    const where: Where<Schemas['users']>[] = [{ field: 'id', value: id }];
    if (password) {
      where.push({ field: 'password', value: password });
    }
    if (nickname) {
      where.push({ field: 'nickname', value: nickname, logic: 'OR' });
    }

    const queryConfig = selectUsersQuery({ where });

    try {
      const queryResult = (await this.client.query<AdvancedUser>(queryConfig))
        .rows;
      return queryResult[0];
    } catch (error) {
      console.error(error);
      return;
    }
  }

  async getUserList({ q }: { q?: string }) {
    await this.init();
    if (!this.client) return;
    const where: Where<Schemas['users']>[] = [];
    if (q) {
      where.push({
        field: 'id',
        operator: '~~',
        value: `%${decodeURIComponent(q)}%`,
        logic: 'OR',
      });
      where.push({
        field: 'nickname',
        operator: '~~',
        value: `%${decodeURIComponent(q)}%`,
        logic: 'OR',
      });
    }

    const queryConfig = selectUsersQuery({
      where,
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

  async getPostList({}: {
    usserId?: string;
    parentId?: string;
    originalId?: string;
    followIds?: string[];
    quote?: boolean;
    withPostIds?: number[];
  }) {}

  async getFollowList({
    source,
    target,
  }: {
    source?: string;
    target?: string;
  }) {
    await this.init();
    if (!this.client) return;
    const where: Where<Schemas['follow']>[] = [];
    if (source) {
      where.push({ field: 'source', value: source });
    }
    if (target) {
      where.push({ field: 'target', value: target });
    }

    const queryConfig = selectQuery({
      table: 'follow',
      where,
    });

    try {
      const queryResult = (await this.client.query<Follow>(queryConfig)).rows;
      return queryResult;
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

  async release() {
    this.client?.release();
  }
}

export default NEW_DAO;
