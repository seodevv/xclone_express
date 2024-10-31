import { Pool, QueryConfig } from 'pg';

export default async function initializeDatabase(pool: Pool) {
  await aliveCheck(pool);

  const fkeys: { source: { table: Table; column: string }; target: Fkey }[] =
    [];
  const isTable = (table: string): table is keyof SchemaInit =>
    Object.keys(SCHEMA_INIT).includes(table);

  for (const table in SCHEMA_INIT) {
    if (!isTable(table)) continue;

    const tableSchema = SCHEMA_INIT[table];
    Object.entries(tableSchema.columns).forEach(([k, v]) => {
      if (v.fkey) {
        fkeys.push({ source: { table: table, column: k }, target: v.fkey });
      }
    });

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

  if (fkeys.length !== 0) {
    for (const fkey of fkeys) {
      const checkConstraint = await getConstraint(pool, fkey);
      if (!checkConstraint) {
        await createConstraint(pool, fkey);
      }
    }
  }

  if (Object.keys(SCHEMA_VIEWS).length !== 0) {
    await createViews(pool);
  }
}

async function aliveCheck(pool: Pool) {
  const queryConfig: QueryConfig = {
    text: 'SELECT 1',
  };

  try {
    await pool.query(queryConfig);
  } catch (error) {
    console.error(error);
    console.error('Unable to connect to database (PostgreSQL).');
    console.error('Please check the connection to the database (PostgreSQL).');
    process.exit(0);
  }
}

async function getTable(pool: Pool, table: keyof SchemaInit) {
  try {
    const result = await pool.query(
      'SELECT * FROM pg_tables WHERE tablename = $1',
      [table]
    );
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getType(pool: Pool, typeName: string) {
  try {
    const result = await pool.query(
      'SELECT t.typname FROM pg_enum e INNER JOIN pg_type t on e.enumtypid = t.oid where typname = $1',
      [typeName]
    );
    return !!result.rows[0];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getConstraint(
  pool: Pool,
  fkey: { source: { table: Table; column: string }; target: Fkey }
) {
  const { source, target } = fkey;
  try {
    const result = await pool.query(
      'SELECT * FROM pg_constraint WHERE contype = $1 AND conname = $2',
      [
        'f',
        `${source.table}_${target.table}_${source.column}_${target.column}_fkey`,
      ]
    );
    return !!result.rows[0];
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
    await pool.query(`CREATE TYPE ${name} AS ENUM ('${values.join("','")}');`);
    console.log(`[DATABASE][TYPE] The ${name} type has been created`);
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
  const keys = Object.keys(columns);
  const pkeys = keys.filter((key) => columns[key].pkey);

  let query = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
  keys.forEach((key, i) => {
    const { type, length, default: def, notNull } = columns[key];
    query += `\t"${key}" ${type}${length ? `(${length})` : ''} ${
      def ? `DEFAULT ${def === 'current_timestamp' ? def : `'${def}'`} ` : ''
    }${notNull ? 'NOT NULL' : 'NULL'}${keys.length - 1 !== i ? ',\n' : ''}`;
  });

  if (pkeys.length !== 0) {
    query += ',\n';
    query += `\tCONSTRAINT ${table}_pkey PRIMARY KEY (${pkeys.join(', ')})`;
  }

  query += '\n';
  query += ');';

  try {
    await pool.query(query);
    console.log(`[DATABASE][TABLE] The ${table} table has been created`);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createConstraint(
  pool: Pool,
  fkey: { source: { table: Table; column: string }; target: Fkey }
) {
  const { source, target } = fkey;
  const constraint_name = `${source.table}_${target.table}_${source.column}_${target.column}_fkey`;
  try {
    const result = await pool.query(
      `ALTER TABLE ${
        source.table
      } ADD CONSTRAINT ${constraint_name} FOREIGN KEY (${
        source.column
      }) REFERENCES ${target.table}(${target.column}) ${
        target.delete ? `ON DELETE ${target.delete}` : ''
      } ${target.update ? `ON UPDATE ${target.update}` : ''}`
    );
    console.log(
      `[DATABASE][CONSTRAINT] The ${constraint_name} has been altered`
    );
    return !!result.rows[0];
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
    try {
      const result = await pool.query(SCHEMA_VIEWS[view]);
      console.log(`[DATABASE][VIEWS] THE ${view} has been created or replaced`);
    } catch (error) {
      console.error(error);
      continue;
    }
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
  | 'messages';

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
  | 'listsdetail_type';

type Fkey = {
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
        fkey?: Fkey;
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
      id: { type: 'varchar', length: 16, notNull: true, pkey: true },
      receiverid: {
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
      createat: {
        type: 'timestamp',
        default: 'current_timestamp',
        notNull: true,
      },
      lastmessageid: {
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
  messages: {
    columns: {
      id: { type: 'serial4', notNull: true, pkey: true },
      roomid: {
        type: 'varchar',
        length: 32,
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
    },
  },
};

const SCHEMA_VIEWS = {
  advancedpost: `create or replace
view advancedpost
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
		else '[]'::json
	end as "Hearts",
	case
		when repost.value is not null then repost.value
		else '[]'::json
	end as "Reposts",
	case
		when comment.value is not null then comment.value
		else '[]'::json
	end as "Comments",
	case
		when bookmark.value is not null then bookmark.value
		else '[]'::json
	end as "Bookmarks",
	json_build_object('Hearts',
	case
		when heart.count is not null then heart.count
		else '0'::bigint
	end,
	'Reposts',
	case
		when repost.count is not null then repost.count
		else '0'::bigint
	end,
	'Comments',
	case
		when comment.count is not null then comment.count
		else '0'::bigint
	end,
	'Bookmarks',
	case
		when bookmark.count is not null then bookmark.count
		else '0'::bigint
	end,
	'Views',
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
		r.postid) heart on
	heart.postid = p.postid
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
		r.postid) repost on
	repost.postid = p.postid
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
		r.postid) comment on
	comment.postid = p.postid
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
		end,
		'Reposts',
		case
			when repost_1.count is not null then repost_1.count
			else '0'::bigint
		end,
		'Comments',
		case
			when comment_1.count is not null then comment_1.count
			else '0'::bigint
		end,
		'Bookmarks',
		case
			when bookmark_1.count is not null then bookmark_1.count
			else '0'::bigint
		end,
		'Views',
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
			end,
			'Reposts',
			case
				when repost_2.count is not null then repost_2.count
				else '0'::bigint
			end,
			'Comments',
			case
				when comment_2.count is not null then comment_2.count
				else '0'::bigint
			end,
			'Bookmarks',
			case
				when bookmark_2.count is not null then bookmark_2.count
				else '0'::bigint
			end,
			'Views',
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
view advancedlists
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
		else '[]'::json
	end as "Member",
	case
		when follower.value is not null then follower.value
		else '[]'::json
	end as "Follower",
	case
		when unshow.value is not null then unshow.value
		else '[]'::json
	end as "UnShow",
	case
		when posts.value is not null then posts.value
		else '[]'::json
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
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text) as value,
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
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text) as value,
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
		json_agg(row_to_json(ld.*)::jsonb - 'listid'::text) as value,
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
		array_to_json(array_agg(p2.postid
	order by
		p2.postid)) as value
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
  advancedrooms: `create or replace
view public.advancedrooms
as
select
	r.id,
	r.receiverid,
	row_to_json(receiver.*) as "Receiver",
	r.senderid,
	row_to_json(sender.*) as "Sender",
	r.createat,
	r.lastmessageid,
	m.content,
	m.createat as lastat
from
	rooms r
join (
	select
		users.id,
		users.nickname,
		users.image,
		users.verified
	from
		users) receiver on
	receiver.id::text = r.receiverid::text
join (
	select
		users.id,
		users.nickname,
		users.image,
		users.verified
	from
		users) sender on
	sender.id::text = r.receiverid::text
left join messages m on
	m.id = r.lastmessageid;`,
  advancedmessages: `create or replace
view public.advancedmessages
as
select
	m.id,
	m.roomid,
	m.senderid,
	row_to_json(u.*) as "Sender",
	m.content,
	m.createat
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
	u.id::text = m.senderid::text;`,
};
