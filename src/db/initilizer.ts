import { PGUSER, pool, SCHEMA_NAME } from '@/db/env';
import { safeQuery } from '@/db/queries';
import { Pool, QueryConfig } from 'pg';

// const USER = process.env.PGUSER || 'xclone';
// const SCHEMA_NAME = process.env.PGSCHEMA || 'public';

export default async function initializeDatabase() {
  await aliveCheck(pool);

  const pkeys: PKey[] = [];
  const fkeys: FKey[] = [];
  const isTable = (table: string): table is keyof SchemaInit =>
    Object.keys(SCHEMA_INIT).includes(table);

  // create schema
  if (SCHEMA_NAME !== 'public') {
    const checkSchema = await getSchema(pool, SCHEMA_NAME);
    if (!checkSchema) {
      await createSchema(pool, PGUSER, SCHEMA_NAME);
    }
  }

  // grant schema
  await grantSchema(pool, PGUSER, SCHEMA_NAME);

  // create table
  for (const table in SCHEMA_INIT) {
    if (!isTable(table)) continue;

    const tableSchema = SCHEMA_INIT[table];
    const pkey: PKey = { type: 'P', table, fields: [] };
    const unique: PKey = { type: 'U', table, fields: [] };
    Object.entries(tableSchema.columns).forEach(([k, v]) => {
      if (v.fkey) {
        fkeys.push({ source: { table: table, column: k }, target: v.fkey });
      }
      if (v.pkey) {
        pkey.fields.push(k);
      }
      if (v.unique) {
        unique.fields.push(k);
      }
    });
    if (pkey.fields.length !== 0) {
      pkeys.push(pkey);
    }
    if (unique.fields.length !== 0) {
      pkeys.push(unique);
    }

    const checkTable = await getTable(pool, table);
    if (checkTable) continue;

    if (typeof tableSchema.type !== 'undefined') {
      const type = tableSchema.type;
      const checkType = await getType(pool, type.name);
      if (!checkType) {
        await createType(pool, { name: type.name, values: type.values });
      }
    }

    await createTable(pool, table, SCHEMA_INIT[table].columns);
  }

  // create primary key
  if (pkeys.length !== 0) {
    for (const pkey of pkeys) {
      const checkConstraint = await getConstraint(pool, pkey);
      if (!checkConstraint) {
        await createConstraint(pool, pkey);
      }
    }
  }

  // create foreign/unique key
  if (fkeys.length !== 0) {
    for (const fkey of fkeys) {
      const checkConstraint = await getConstraint(pool, fkey);
      if (!checkConstraint) {
        await createConstraint(pool, fkey);
      }
    }
  }

  // create view
  if (Object.keys(SCHEMA_VIEWS).length !== 0) {
    await createViews(pool);
  }
}

async function aliveCheck(pool: Pool) {
  const queryConfig: QueryConfig = {
    text: 'SELECT 1',
  };

  try {
    await safeQuery(pool, queryConfig);
  } catch (error) {
    console.error('Unable to connect to database (PostgreSQL).');
    console.error('Please check the connection to the database (PostgreSQL).');
    throw error;
  }
}

async function getSchema(pool: Pool, schema: string) {
  const queryConfig: QueryConfig = {
    text: `select nspname from pg_namespace where nspname = $1`,
    values: [schema],
  };
  try {
    const result = await safeQuery(pool, queryConfig);
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getTable(pool: Pool, table: keyof SchemaInit) {
  const queryConfig: QueryConfig = {
    text: 'SELECT * FROM pg_tables WHERE tablename = $1 and schemaname = $2',
    values: [table, SCHEMA_NAME],
  };
  try {
    const result = await safeQuery(pool, queryConfig);
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getType(pool: Pool, typeName: string) {
  const queryConfig: QueryConfig = {
    text: `select
  n.nspname,
	t.typname,
	t.typtype
from
	pg_type t
join pg_namespace n on
	t.typnamespace = n.oid
where
	t.typtype = $1
	and n.nspname = $2
	and t.typname = $3`,
    values: ['e', SCHEMA_NAME, typeName],
  };
  try {
    const result = await safeQuery(pool, queryConfig);
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

function isPrimaryKey(key: PKey | FKey): key is PKey {
  return Object.keys(key).includes('table');
}

async function getConstraint(pool: Pool, key: FKey | PKey) {
  try {
    if (isPrimaryKey(key)) {
      const queryConfig: QueryConfig = {
        text: `select
	n.nspname,
	c.relname,
	con.conname,
	con.contype
from
	pg_constraint con
join pg_class c on
	con.conrelid = c.oid
join pg_namespace n on
	c.relnamespace = n.oid
where
	con.contype = $1
	and con.conname = $2
	and n.nspname = $3`,
        values: [
          key.type === 'P' ? 'p' : 'u',
          key.type === 'P'
            ? `${key.table}_pkey`
            : key.type === 'U'
            ? `${key.table}_ukey`
            : `${key.table}_${key.fields.join('_')}_key`,
          SCHEMA_NAME,
        ],
      };
      const result = await safeQuery(pool, queryConfig);
      return !!result.rows[0];
    } else {
      const { source, target } = key;
      const queryConfig: QueryConfig = {
        text: `select
	n.nspname,
	c.relname,
	con.conname,
	con.contype
from
	pg_constraint con
join pg_class c on
	con.conrelid = c.oid
join pg_namespace n on
	c.relnamespace = n.oid
where
	con.contype = $1
	and con.conname = $2
	and n.nspname = $3`,
        values: [
          'f',
          `${source.table}_${target.table}_${source.column}_${target.column}_fkey`,
          SCHEMA_NAME,
        ],
      };
      const result = await safeQuery(pool, queryConfig);
      return !!result.rows[0];
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getView(pool: Pool, view: string, schema: string) {
  const queryConfig: QueryConfig = {
    text: 'select schemaname, viewname, definition from pg_views where viewname = $1 and schemaname = $2',
    values: [view, schema],
  };

  try {
    const result = await safeQuery(pool, queryConfig);
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createSchema(pool: Pool, user: string, schema: string) {
  const queryConfig: QueryConfig = {
    text: `CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${user}`,
  };
  try {
    await safeQuery(pool, queryConfig);
    console.log(`[DATABASE][SCHEMA] The ${schema} schema has been created`);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createType(
  pool: Pool,
  { name, values }: { name: string; values: string[] }
) {
  try {
    const queryConfig: QueryConfig = {
      text: `CREATE TYPE ${SCHEMA_NAME}.${name} AS ENUM ('${values.join(
        "','"
      )}');`,
    };
    await safeQuery(pool, queryConfig);
    console.log(
      `[DATABASE][TYPE] The ${SCHEMA_NAME}.${name} type has been created`
    );
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createTable<T extends Table>(
  pool: Pool,
  table: T,
  columns: SchemaInit[T]['columns']
) {
  const queryConfig: QueryConfig = {
    text: `CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.${table} (\n`,
  };

  const keys = Object.keys(columns);
  keys.forEach((key, i) => {
    const { type, length, default: def, notNull } = columns[key];
    queryConfig.text += `\t"${key}" ${type}${length ? `(${length})` : ''} ${
      typeof def !== 'undefined'
        ? `DEFAULT ${def === 'current_timestamp' ? def : `'${def}'`} `
        : ''
    }${notNull ? 'NOT NULL' : 'NULL'}${keys.length - 1 !== i ? ',\n' : ''}`;
  });
  queryConfig.text += '\n';
  queryConfig.text += ');';

  try {
    await safeQuery(pool, queryConfig);
    console.log(
      `[DATABASE][TABLE] The ${SCHEMA_NAME}.${table} table has been created`
    );
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createConstraint(pool: Pool, key: FKey | PKey) {
  try {
    if (isPrimaryKey(key)) {
      const { table, fields } = key;
      const constraint_name = `${table}_${
        key.type === 'P'
          ? 'pkey'
          : key.type === 'U'
          ? 'ukey'
          : `${key.fields.join('_')}_key`
      }`;
      const queryConfig: QueryConfig = {
        text: `ALTER TABLE ${table} ADD CONSTRAINT ${constraint_name} ${
          key.type === 'P' ? 'PRIMARY KEY' : 'UNIQUE'
        } (${fields.join(', ')})`,
      };
      await safeQuery(pool, queryConfig);
      console.log(
        `[DATABASE][CONSTRAINT] The ${constraint_name} has been altered`
      );
      return true;
    } else {
      const { source, target } = key;
      const constraint_name = `${source.table}_${target.table}_${source.column}_${target.column}_fkey`;
      const queryConfig: QueryConfig = {
        text: `ALTER TABLE ${
          source.table
        } ADD CONSTRAINT ${constraint_name} FOREIGN KEY (${
          source.column
        }) REFERENCES ${target.table}(${target.column}) ${
          target.delete ? `ON DELETE ${target.delete}` : ''
        } ${target.update ? `ON UPDATE ${target.update}` : ''}`,
      };
      await safeQuery(pool, queryConfig);
      console.log(
        `[DATABASE][CONSTRAINT] The ${constraint_name} has been altered`
      );
      return true;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createViews(pool: Pool) {
  const isView = (view: string): view is keyof typeof SCHEMA_VIEWS =>
    Object.keys(SCHEMA_VIEWS).includes(view);

  for (const view in SCHEMA_VIEWS) {
    if (!isView(view)) continue;

    const checkView = await getView(pool, view, SCHEMA_NAME);
    if (checkView) {
      // console.log(`[DATEBASE][VIEWS] The ${SCHEMA_NAME}.${view} already exist`);
      continue;
    }

    try {
      const queryConfig: QueryConfig = {
        text: SCHEMA_VIEWS[view],
      };
      await safeQuery(pool, queryConfig);
      console.log(`[DATABASE][VIEWS] THE ${view} has been created or replaced`);
    } catch (error) {
      console.error(error);
      continue;
    }
  }
}

async function grantSchema(pool: Pool, user: string, schema: string) {
  try {
    await safeQuery(pool, {
      text: `GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${user};`,
    });
    await safeQuery(pool, {
      text: `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${user}`,
    });
    await safeQuery(pool, {
      text: `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${user}`,
    });
    await safeQuery(pool, {
      text: `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} TO ${user}`,
    });
    await safeQuery(pool, {
      text: `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schema} TO ${user}`,
    });
    await safeQuery(pool, {
      text: `GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${user}`,
    });
    await safeQuery(pool, {
      text: `ALTER ROLE ${user} SET search_path = ${schema}`,
    });
    // console.log(`[DATABASE][GRANT][${user}] THE ${schema} has been granted`);

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

type Table =
  | 'users'
  | 'follow'
  | 'post'
  | 'reactions'
  | 'views'
  | 'hashtags'
  | 'lists'
  | 'listsdetail'
  | 'rooms'
  | 'roomsdetail'
  | 'roomssnooze'
  | 'messages'
  | 'messagesdetail'
  | 'messagesmedia';

type ColumnTypes =
  | 'int4'
  | 'float4'
  | 'serial4'
  | 'varchar'
  | 'json'
  | 'jsonb'
  | 'timestamp'
  | 'bool';

type CustomTypes =
  | 'post_scope'
  | 'reactions_type'
  | 'hashtags_type'
  | 'lists_make'
  | 'listsdetail_type'
  | 'roomsdetail_type'
  | 'roomssnooze_type'
  | 'messagesdetail_type'
  | 'messagesmedia_type';

type PKey = { type: 'P' | 'U'; table: Table; fields: string[] };
type FKey = { source: { table: Table; column: string }; target: FKeyTarget };
type FKeyTarget = {
  table: Table;
  column: string;
  delete?: 'RESTRICT' | 'CASCADE' | 'NO ACTION' | 'SET NULL';
  update?: 'RESTRICT' | 'CASCADE' | 'NO ACTION' | 'SET NULL';
};

type SchemaInit = {
  [Key in Table]: {
    type?: {
      name: CustomTypes;
      values: string[];
    };
    columns: {
      [Props in string]: {
        type: ColumnTypes | CustomTypes;
        length?: number;
        notNull?: true;
        default?: string;
        pkey?: true;
        fkey?: FKeyTarget;
        unique?: true;
      };
    };
  };
};

const SCHEMA_INIT: SchemaInit = {
  users: {
    columns: {
      id: { type: 'varchar', length: 32, notNull: true, pkey: true },
      password: { type: 'varchar', length: 128, notNull: true },
      nickname: { type: 'varchar', length: 32, notNull: true },
      image: { type: 'varchar', length: 128, notNull: true },
      banner: { type: 'varchar', length: 128 },
      desc: { type: 'varchar', length: 512 },
      location: { type: 'varchar', length: 128 },
      birth: { type: 'jsonb' },
      verified: { type: 'jsonb' },
      refer: { type: 'varchar', length: 256 },
      regist: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
    },
  },
  follow: {
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      source: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      target: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
    },
  },
  post: {
    type: {
      name: 'post_scope',
      values: ['every', 'follow', 'verified', 'only'],
    },
    columns: {
      postid: { type: 'serial4', notNull: true, pkey: true },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      content: { type: 'varchar', length: 512, notNull: true },
      images: { type: 'jsonb', notNull: true },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
      parentid: {
        type: 'int4',
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'SET NULL',
          update: 'CASCADE',
        },
      },
      originalid: {
        type: 'int4',
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'SET NULL',
          update: 'CASCADE',
        },
      },
      quote: { type: 'bool', default: 'false', notNull: true },
      pinned: { type: 'bool', default: 'false', notNull: true },
      scope: { type: 'post_scope', default: 'every', notNull: true },
    },
  },
  reactions: {
    type: {
      name: 'reactions_type',
      values: ['Heart', 'Repost', 'Comment', 'Bookmark'],
    },
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      type: { type: 'reactions_type', notNull: true },
      postid: {
        type: 'int4',
        notNull: true,
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      commentid: {
        type: 'int4',
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      quote: { type: 'bool', default: 'false', notNull: true },
    },
  },
  views: {
    columns: {
      postid: {
        type: 'int4',
        notNull: true,
        pkey: true,
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      impressions: { type: 'int4', default: '0', notNull: true },
      engagements: { type: 'int4', default: '0', notNull: true },
      detailexpands: { type: 'int4', default: '0', notNull: true },
      newfollowers: { type: 'int4', default: '0', notNull: true },
      profilevisit: { type: 'int4', default: '0', notNull: true },
    },
  },
  hashtags: {
    type: {
      name: 'hashtags_type',
      values: ['tag', 'word'],
    },
    columns: {
      id: { type: 'serial4', notNull: true },
      type: {
        type: 'hashtags_type',
        default: 'tag',
        notNull: true,
        pkey: true,
      },
      title: { type: 'varchar', length: 32, notNull: true, pkey: true },
      count: { type: 'int4', default: '1', notNull: true },
      weight: { type: 'float4', default: '1', notNull: true },
    },
  },
  lists: {
    type: {
      name: 'lists_make',
      values: ['private', 'public'],
    },
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      name: { type: 'varchar', length: 64, notNull: true },
      description: { type: 'varchar', length: 512 },
      banner: { type: 'varchar', length: 256, notNull: true },
      thumbnail: { type: 'varchar', length: 256, notNull: true },
      make: { type: 'lists_make', default: 'public', notNull: true },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
    },
  },
  listsdetail: {
    type: {
      name: 'listsdetail_type',
      values: ['member', 'post', 'unpost', 'follower', 'pinned', 'unshow'],
    },
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      listid: {
        type: 'int4',
        notNull: true,
        fkey: {
          table: 'lists',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      type: { type: 'listsdetail_type', notNull: true },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      postid: {
        type: 'int4',
        fkey: {
          table: 'post',
          column: 'postid',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
    },
  },
  rooms: {
    columns: {
      id: { type: 'varchar', length: 128, notNull: true, pkey: true },
      receiverid: {
        type: 'varchar',
        length: 32,
        unique: true,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      senderid: {
        type: 'varchar',
        length: 32,
        unique: true,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
    },
  },
  roomsdetail: {
    type: { name: 'roomsdetail_type', values: ['disable', 'pin'] },
    columns: {
      id: { type: 'serial4', notNull: true },
      type: { type: 'roomsdetail_type', notNull: true, pkey: true },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        pkey: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      roomid: {
        type: 'varchar',
        length: 128,
        notNull: true,
        pkey: true,
        fkey: {
          table: 'rooms',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
    },
  },
  roomssnooze: {
    type: { name: 'roomssnooze_type', values: ['1h', '8h', '1w', 'forever'] },
    columns: {
      id: { type: 'serial4', notNull: true },
      type: { type: 'roomssnooze_type', notNull: true },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        pkey: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      roomid: {
        type: 'varchar',
        length: 128,
        notNull: true,
        pkey: true,
        fkey: {
          table: 'rooms',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
    },
  },
  messages: {
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      roomid: {
        type: 'varchar',
        length: 128,
        notNull: true,
        fkey: {
          table: 'rooms',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      senderid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      content: { type: 'varchar', length: 512, notNull: true },
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
      seen: { type: 'bool', default: 'false', notNull: true },
      parentid: {
        type: 'int4',
        fkey: {
          table: 'messages',
          column: 'id',
          delete: 'SET NULL',
          update: 'CASCADE',
        },
      },
    },
  },
  messagesdetail: {
    type: {
      name: 'messagesdetail_type',
      values: ['react', 'disable', 'image', 'gif'],
    },
    columns: {
      id: { type: 'serial4', notNull: true },
      type: { type: 'messagesdetail_type', notNull: true, pkey: true },
      messageid: {
        type: 'int4',
        notNull: true,
        pkey: true,
        fkey: {
          table: 'messages',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      userid: {
        type: 'varchar',
        length: 32,
        notNull: true,
        pkey: true,
        fkey: {
          table: 'users',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      content: { type: 'varchar', length: 256, default: '', notNull: true },
    },
  },
  messagesmedia: {
    type: { name: 'messagesmedia_type', values: ['image', 'gif'] },
    columns: {
      id: { type: 'serial4', notNull: true },
      type: { type: 'messagesmedia_type', notNull: true, pkey: true },
      messageid: {
        type: 'int4',
        notNull: true,
        pkey: true,
        fkey: {
          table: 'messages',
          column: 'id',
          delete: 'CASCADE',
          update: 'CASCADE',
        },
      },
      url: { type: 'varchar', length: 256, notNull: true },
      width: { type: 'int4', notNull: true },
      height: { type: 'int4', notNull: true },
    },
  },
};

const SCHEMA_VIEWS = {
  advancedusers: `CREATE OR REPLACE VIEW ${SCHEMA_NAME}.advancedusers
AS SELECT u.id,
    u.nickname,
    u.image,
    u.banner,
    u."desc",
    u.location,
    u.birth,
    u.refer,
    u.verified,
    u.regist,
        CASE
            WHEN follower.value IS NOT NULL THEN follower.value
            ELSE '[]'::jsonb
        END AS "Followers",
        CASE
            WHEN following.value IS NOT NULL THEN following.value
            ELSE '[]'::jsonb
        END AS "Followings",
    json_build_object('Followers',
        CASE
            WHEN follower.count IS NOT NULL THEN follower.count
            ELSE '0'::bigint
        END, 'Followings',
        CASE
            WHEN following.count IS NOT NULL THEN following.count
            ELSE '0'::bigint
        END)::jsonb AS _count
   FROM users u
     LEFT JOIN ( SELECT f.source,
            json_agg(row_to_json(f.*)::jsonb - 'source'::text)::jsonb AS value,
            count(*) AS count
           FROM ( SELECT follow.source,
                    follow.target AS id
                   FROM follow) f
          GROUP BY f.source) following ON following.source::text = u.id::text
     LEFT JOIN ( SELECT f.target,
            json_agg(row_to_json(f.*)::jsonb - 'target'::text)::jsonb AS value,
            count(*) AS count
           FROM ( SELECT follow.source AS id,
                    follow.target
                   FROM follow) f
          GROUP BY f.target) follower ON follower.target::text = u.id::text
  ORDER BY u.regist DESC;`,
  advancedpost: `create or replace
view ${SCHEMA_NAME}.advancedpost
as
select
	p.postid,
	p.userid,
	row_to_json(u.*) as "User",
	p.content,
	p.images,
	p.createat,
	p.parentid,
	row_to_json(parent.*) as "Parent",
	p.originalid,
	row_to_json(original.*) as "Original",
	p.quote,
	p.pinned,
	p.scope,
	case
		when heart.value is not null then heart.value
		else '[]'::jsonb
	end as "Hearts",
	case
		when repost.value is not null then repost.value
		else '[]'::jsonb
	end as "Reposts",
	case
		when comment.value is not null then comment.value
		else '[]'::jsonb
	end as "Comments",
	case
		when bookmark.value is not null then bookmark.value
		else '[]'::jsonb
	end as "Bookmarks",
	json_build_object('Hearts',
        case
            when heart.count is not null then heart.count
            else '0'::bigint
        end, 'Reposts',
        case
            when repost.count is not null then repost.count
            else '0'::bigint
        end, 'Comments',
        case
            when comment.count is not null then comment.count
            else '0'::bigint
        end, 'Bookmarks',
        case
            when bookmark.count is not null then bookmark.count
            else '0'::bigint
        end, 'Views',
        case
            when v.impressions is not null then v.impressions
            else 0
        end) as _count
from
	post p
join (
	select
		users.id,
		users.nickname,
		users.image,
		users.verified
	from
		users) u on
	u.id::text = p.userid::text
left join (
	select
		p_1.postid,
		row_to_json(u_1.*) as "User",
		p_1.images
	from
		post p_1
	join (
		select
			users.id,
			users.nickname,
			users.image,
			users.verified
		from
			users) u_1 on
		u_1.id::text = p_1.userid::text) parent on
	parent.postid = p.parentid
left join (
	select
		r.postid,
		json_agg(row_to_json(r.*)::jsonb - 'postid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			reactions.postid,
			reactions.userid as id
		from
			reactions
		where
			reactions.type = 'Heart'::reactions_type) r
	group by
		r.postid) heart on
	heart.postid = p.postid
left join (
	select
		r.postid,
		json_agg(row_to_json(r.*)::jsonb - 'postid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			reactions.postid,
			reactions.userid as id
		from
			reactions
		where
			reactions.type = 'Repost'::reactions_type) r
	group by
		r.postid) repost on
	repost.postid = p.postid
left join (
	select
		r.postid,
		json_agg(row_to_json(r.*)::jsonb - 'postid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			reactions.postid,
			reactions.userid as id
		from
			reactions
		where
			reactions.type = 'Comment'::reactions_type) r
	group by
		r.postid) comment on
	comment.postid = p.postid
left join (
	select
		r.postid,
		json_agg(row_to_json(r.*)::jsonb - 'postid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			reactions.postid,
			reactions.userid as id
		from
			reactions
		where
			reactions.type = 'Bookmark'::reactions_type) r
	group by
		r.postid) bookmark on
	bookmark.postid = p.postid
left join views v on
	v.postid = p.postid
left join (
	select
		p_1.postid,
		p_1.userid,
		row_to_json(u_1.*) as "User",
		p_1.content,
		p_1.images,
		p_1.createat,
		p_1.parentid,
		p_1.originalid,
		row_to_json(o.*) as "Original",
		p_1.quote,
		p_1.pinned,
		p_1.scope,
		case
			when heart_1.value is not null then heart_1.value
			else '[]'::json
		end as "Hearts",
		case
			when repost_1.value is not null then repost_1.value
			else '[]'::json
		end as "Reposts",
		case
			when comment_1.value is not null then comment_1.value
			else '[]'::json
		end as "Comments",
		case
			when bookmark_1.value is not null then bookmark_1.value
			else '[]'::json
		end as "Bookmarks",
		json_build_object('Hearts',
                case
                    when heart_1.count is not null then heart_1.count
                    else '0'::bigint
                end, 'Reposts',
                case
                    when repost_1.count is not null then repost_1.count
                    else '0'::bigint
                end, 'Comments',
                case
                    when comment_1.count is not null then comment_1.count
                    else '0'::bigint
                end, 'Bookmarks',
                case
                    when bookmark_1.count is not null then bookmark_1.count
                    else '0'::bigint
                end, 'Views',
                case
                    when v_1.impressions is not null then v_1.impressions
                    else 0
                end) as _count
	from
		post p_1
	join (
		select
			users.id,
			users.nickname,
			users.image,
			users.verified
		from
			users) u_1 on
		u_1.id::text = p_1.userid::text
	left join (
		select
			r.postid,
			json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
			count(*) as count
		from
			(
			select
				reactions.postid,
				reactions.userid as id
			from
				reactions
			where
				reactions.type = 'Heart'::reactions_type) r
		group by
			r.postid) heart_1 on
		heart_1.postid = p_1.postid
	left join (
		select
			r.postid,
			json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
			count(*) as count
		from
			(
			select
				reactions.postid,
				reactions.userid as id
			from
				reactions
			where
				reactions.type = 'Repost'::reactions_type) r
		group by
			r.postid) repost_1 on
		repost_1.postid = p_1.postid
	left join (
		select
			r.postid,
			json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
			count(*) as count
		from
			(
			select
				reactions.postid,
				reactions.userid as id
			from
				reactions
			where
				reactions.type = 'Comment'::reactions_type) r
		group by
			r.postid) comment_1 on
		comment_1.postid = p_1.postid
	left join (
		select
			r.postid,
			json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
			count(*) as count
		from
			(
			select
				reactions.postid,
				reactions.userid as id
			from
				reactions
			where
				reactions.type = 'Bookmark'::reactions_type) r
		group by
			r.postid) bookmark_1 on
		bookmark_1.postid = p_1.postid
	left join views v_1 on
		v_1.postid = p_1.postid
	left join (
		select
			p_2.postid,
			p_2.userid,
			row_to_json(u_2.*) as "User",
			p_2.content,
			p_2.images,
			p_2.createat,
			p_2.parentid,
			p_2.originalid,
			p_2.quote,
			p_2.pinned,
			p_2.scope,
			case
				when heart_2.value is not null then heart_2.value
				else '[]'::json
			end as "Hearts",
			case
				when repost_2.value is not null then repost_2.value
				else '[]'::json
			end as "Reposts",
			case
				when comment_2.value is not null then comment_2.value
				else '[]'::json
			end as "Comments",
			case
				when bookmark_2.value is not null then bookmark_2.value
				else '[]'::json
			end as "Bookmarks",
			json_build_object('Hearts',
                        case
                            when heart_2.count is not null then heart_2.count
                            else '0'::bigint
                        end, 'Reposts',
                        case
                            when repost_2.count is not null then repost_2.count
                            else '0'::bigint
                        end, 'Comments',
                        case
                            when comment_2.count is not null then comment_2.count
                            else '0'::bigint
                        end, 'Bookmarks',
                        case
                            when bookmark_2.count is not null then bookmark_2.count
                            else '0'::bigint
                        end, 'Views',
                        case
                            when v_2.impressions is not null then v_2.impressions
                            else 0
                        end) as _count
		from
			post p_2
		join (
			select
				users.id,
				users.nickname,
				users.image,
				users.verified
			from
				users) u_2 on
			u_2.id::text = p_2.userid::text
		left join (
			select
				r.postid,
				json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
				count(*) as count
			from
				(
				select
					reactions.postid,
					reactions.userid as id
				from
					reactions
				where
					reactions.type = 'Heart'::reactions_type) r
			group by
				r.postid) heart_2 on
			heart_2.postid = p_2.postid
		left join (
			select
				r.postid,
				json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
				count(*) as count
			from
				(
				select
					reactions.postid,
					reactions.userid as id
				from
					reactions
				where
					reactions.type = 'Repost'::reactions_type) r
			group by
				r.postid) repost_2 on
			repost_2.postid = p_2.postid
		left join (
			select
				r.postid,
				json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
				count(*) as count
			from
				(
				select
					reactions.postid,
					reactions.userid as id
				from
					reactions
				where
					reactions.type = 'Comment'::reactions_type) r
			group by
				r.postid) comment_2 on
			comment_2.postid = p_2.postid
		left join (
			select
				r.postid,
				json_agg(row_to_json(r.*)::jsonb - 'postid'::text) as value,
				count(*) as count
			from
				(
				select
					reactions.postid,
					reactions.userid as id
				from
					reactions
				where
					reactions.type = 'Bookmark'::reactions_type) r
			group by
				r.postid) bookmark_2 on
			bookmark_2.postid = p_2.originalid
		left join views v_2 on
			v_2.postid = p_2.postid) o on
		o.postid = p_1.originalid) original on
	original.postid = p.originalid
order by
	p.createat desc;`,
  advancedlists: `create or replace
view ${SCHEMA_NAME}.advancedlists
as
select
	l.id,
	l.userid,
	row_to_json(u.*) as "User",
	l.name,
	l.description,
	l.banner,
	l.thumbnail,
	l.make,
	l.createat,
	case
		when member.value is not null then member.value
		else '[]'::jsonb
	end as "Member",
	case
		when follower.value is not null then follower.value
		else '[]'::jsonb
	end as "Follower",
	case
		when unshow.value is not null then unshow.value
		else '[]'::jsonb
	end as "UnShow",
	case
		when posts.value is not null then posts.value
		else '[]'::jsonb
	end as "Posts"
from
	lists l
join (
	select
		users.id,
		users.nickname,
		users.image,
		users.verified
	from
		users) u on
	u.id::text = l.userid::text
left join (
	select
		ld.listid,
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			listsdetail.listid,
			listsdetail.userid as id
		from
			listsdetail
		where
			listsdetail.type = 'member'::listsdetail_type) ld
	group by
		ld.listid) member on
	member.listid = l.id
left join (
	select
		ld.listid,
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			listsdetail.listid,
			listsdetail.userid as id
		from
			listsdetail
		where
			listsdetail.type = 'follower'::listsdetail_type) ld
	group by
		ld.listid) follower on
	follower.listid = l.id
left join (
	select
		ld.listid,
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text)::jsonb as value,
		count(*) as count
	from
		(
		select
			listsdetail.listid,
			listsdetail.userid as id
		from
			listsdetail
		where
			listsdetail.type = 'unshow'::listsdetail_type) ld
	group by
		ld.listid) unshow on
	unshow.listid = l.id
left join (
	select
		p2.listid,
		array_to_json(array_agg(p2.postid order by p2.postid))::jsonb as value
	from
		(
		select
			ld.listid,
			p.postid
		from
			post p
		join (
			select
				listsdetail.listid,
				listsdetail.userid
			from
				listsdetail
			where
				listsdetail.type = 'member'::listsdetail_type) ld on
			ld.userid::text = p.userid::text
	union
		select
			l_1.listid,
			l_1.postid
		from
			listsdetail l_1
		where
			l_1.type = 'post'::listsdetail_type) p2
	where
		not ((p2.listid,
		p2.postid) in (
		select
			listsdetail.listid,
			listsdetail.postid
		from
			listsdetail
		where
			listsdetail.type = 'unpost'::listsdetail_type))
	group by
		p2.listid) posts on
	posts.listid = l.id
order by
	follower.count,
	member.count;`,
  advancedrooms: `CREATE OR REPLACE VIEW ${SCHEMA_NAME}.advancedrooms
AS SELECT r.id,
    r.receiverid,
    row_to_json(receiver.*) AS "Receiver",
    r.senderid,
    row_to_json(sender.*) AS "Sender",
    r.createat,
        CASE
            WHEN n.sent IS NULL THEN '[]'::json
            ELSE n.sent
        END AS sent
   FROM rooms r
     JOIN ( SELECT users.id,
            users.nickname,
            users.image,
            users.verified
           FROM users) receiver ON receiver.id::text = r.receiverid::text
     JOIN ( SELECT users.id,
            users.nickname,
            users.image,
            users.verified
           FROM users) sender ON sender.id::text = r.senderid::text
     LEFT JOIN ( SELECT a.roomid,
            json_agg(row_to_json(a.*)::jsonb - 'roomid'::text) AS sent
           FROM ( SELECT m_1.roomid,
                    m_1.senderid AS id,
                    count(m_1.senderid) AS count
                   FROM messages m_1
                  WHERE m_1.seen = false
                  GROUP BY m_1.roomid, m_1.senderid) a
          GROUP BY a.roomid) n ON n.roomid::text = r.id::text;`,
  advancedmessages: `create or replace
view ${SCHEMA_NAME}.advancedmessages
as
select
	m.id,
	m.roomid,
	m.senderid,
	row_to_json(u.*) as "Sender",
	m.content,
	m.createat,
	m.seen,
	m.parentid,
	row_to_json(am.*) as "Parent",
	case
		when md_1.value is null then '[]'::jsonb
		else md_1.value
	end as "Disable",
	case
		when md_2.value is null then '[]'::jsonb
		else md_2.value
	end as "React",
	mm.value as "Media"
from
	messages m
join (
	select
		users.id,
		users.nickname,
		users.image,
		users.verified
	from
		users) u on
	u.id::text = m.senderid::text
left join (
	select
		s_md.messageid,
		json_agg(json_build_object('id', s_md.userid))::jsonb as value
	from
		(
		select
			s_md_1.messageid,
			s_md_1.userid
		from
			messagesdetail s_md_1
		where
			s_md_1.type = 'disable'::messagesdetail_type) s_md
	group by
		s_md.messageid) md_1 on
	md_1.messageid = m.id
left join (
	select
		s_2_md.messageid,
		json_agg(row_to_json(s_2_md.*)::jsonb - 'messageid'::text)::jsonb as value
	from
		(
		select
			s_md.messageid,
			s_md.userid as id,
			s_u.nickname,
			s_u.image,
			s_u.verified,
			s_md.content
		from
			messagesdetail s_md
		join users s_u on
			s_u.id::text = s_md.userid::text
		where
			s_md.type = 'react'::messagesdetail_type) s_2_md
	group by
		s_2_md.messageid) md_2 on
	md_2.messageid = m.id
left join (
	select
		s_mm.messageid,
		row_to_json(s_mm.*)::jsonb - 'messageid'::text as value
	from
		messagesmedia s_mm) mm on
	mm.messageid = m.id
left join (
	select
		m_1.id,
		m_1.senderid,
		row_to_json(u_1.*) as "Sender",
		m_1.content,
		m_1.createat,
		mm_1.value as "Media"
	from
		messages m_1
	join (
		select
			users.id,
			users.nickname,
			users.image,
			users.verified
		from
			users) u_1 on
		u_1.id::text = m_1.senderid::text
	left join messages m2 on
		m2.id = m_1.parentid
	left join (
		select
			s_mm.messageid,
			row_to_json(s_mm.*)::jsonb - 'messageid'::text as value
		from
			messagesmedia s_mm) mm_1 on
		mm_1.messageid = m_1.id
	order by
		m_1.id desc) am on
	am.id = m.parentid
order by
	m.id desc;`,
};
