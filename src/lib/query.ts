import {
  Schemas,
  RequiredQueryConfig,
  Where,
  Order,
  Birth,
  Verified,
} from '@/db/schema';
import { QueryConfig } from 'pg';

function makeSelectField<T extends keyof Schemas>(
  table: T,
  fields?: (keyof Schemas[T])[]
): RequiredQueryConfig['text'] {
  let text = 'SELECT\n';

  if (fields && fields.length !== 0) {
    fields.forEach((field, i) => {
      text += `\t${i === 0 ? '' : ','}${field.toString()}\n`;
    });
  } else {
    text += '\t*\n';
  }

  text += `FROM\n\t${table}\n`;

  return text;
}

function makeInsertField<T extends keyof Schemas>(
  table: T,
  values: any[],
  fields?: (keyof Schemas[T])[]
): RequiredQueryConfig {
  const queryConfig: RequiredQueryConfig = {
    text: `INSERT INTO ${table}`,
    values: values,
  };

  if (fields?.length !== values.length) {
    throw new Error('The number of fields and values ​​do not match.');
  }

  if (fields && fields.length !== 0) {
    queryConfig.text += '(';
    fields.forEach((field, i) => {
      queryConfig.text += `${i === 0 ? '' : ','}${field.toString()}`;
    });
    queryConfig.text += ')';
  }

  queryConfig.text += ' values(';
  values.forEach((v, i) => {
    queryConfig.text += `${i === 0 ? '' : ','}$${i + 1}`;
  });
  queryConfig.text += ') RETURNING *';

  return queryConfig;
}

function makeUpdateField<T extends keyof Schemas>(
  table: T,
  update: { fields: (keyof Schemas[T])[]; values: any[] },
  wheres: Where<Schemas[T]>[][]
) {
  const queryConfig: RequiredQueryConfig = {
    text: `UPDATE\n\t${table}\nSET`,
    values: update.values,
  };

  if (update.fields.length === 0 || update.values.length === 0) {
    throw new Error('There are no fields or values ​​to update.');
  }

  if (update.fields.length !== update.values.length) {
    throw new Error('The number of fields and values ​​do not match.');
  }

  update.fields.forEach((field, i) => {
    queryConfig.text += `${i === 0 ? '' : ','}\n\t"${field.toString()}" = $${
      i + 1
    }`;
  });
  queryConfig.text += '\n';

  const { text, values } = makeWhere(
    queryConfig,
    wheres,
    update.fields.length + 1
  );
  queryConfig.text = text;
  queryConfig.values = values;

  return queryConfig;
}

function makeDeleteField<T extends keyof Schemas>(
  table: T,
  wheres: Where<Schemas[T]>[][]
) {
  let queryConfig: RequiredQueryConfig = {
    text: `DELETE FROM ${table} `,
    values: [],
  };
  queryConfig = makeWhere(queryConfig, wheres);

  return queryConfig;
}

function makeWhere<T>(
  queryConfig: RequiredQueryConfig,
  wheres?: Where<T>[][],
  startIndex = 1
): RequiredQueryConfig {
  if (wheres && wheres.length !== 0) {
    let index = startIndex;

    wheres.forEach((where, i) => {
      if (wheres[i].length === 0) return;
      if (i === 0) {
        queryConfig.text += 'WHERE\n';
      }

      queryConfig.text += ` ${i === 0 ? '' : 'AND '}(\n`;
      where.forEach(({ tableAlias, field, operator, value, logic }, j) => {
        const isParam = operator !== 'is null' && operator !== 'is not null';

        queryConfig.text += `\t${j === 0 ? '' : `${logic || 'AND'} `}${
          tableAlias ? `${tableAlias}.` : ''
        }${field.toString()} ${operator || '='} ${
          operator === 'in' || operator === 'not in' ? '(' : ''
        }${isParam ? `$${index}` : ''}${
          operator === 'in' || operator === 'not in' ? ')' : ''
        }\n`;

        if (isParam) {
          queryConfig.values?.push(value);
          index++;
        }
      });
      queryConfig.text += ' )\n';
    });
  }

  return queryConfig;
}

function makeOrder<T>(
  text: RequiredQueryConfig['text'],
  order?: Order<T>[]
): RequiredQueryConfig['text'] {
  if (order && order.length !== 0) {
    text += 'ORDER BY\n';
    order.forEach(({ field, by }, i) => {
      text += `  ${i === 0 ? '' : ','}${field.toString()} ${by || 'ASC'}\n`;
    });
  }

  return text;
}

export const selectQuery = <T extends keyof Schemas>({
  table,
  fields,
  wheres,
  order,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  wheres?: Where<Schemas[T]>[][];
  order?: Order<Schemas[T]>[];
}): QueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: makeSelectField(table, fields),
    values: [],
  };

  const whereResult = makeWhere(queryConfig, wheres);
  queryConfig.text = whereResult.text;
  queryConfig.values = whereResult.values;

  queryConfig.text = makeOrder(queryConfig.text, order);

  return queryConfig;
};

export const insertQuery = <T extends keyof Schemas>({
  table,
  fields,
  values,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  values: any[];
}) => {
  return makeInsertField(table, values, fields);
};

export const updateQuery = <T extends keyof Schemas>({
  table,
  update,
  wheres,
}: {
  table: T;
  update: { fields: (keyof Schemas[T])[]; values: any[] };
  wheres: Where<Schemas[T]>[][];
}) => {
  return makeUpdateField(table, update, wheres);
};

export const deleteQuery = <T extends keyof Schemas>({
  table,
  wheres,
}: {
  table: T;
  wheres: Where<Schemas[T]>[][];
}) => {
  return makeDeleteField(table, wheres);
};

export const selectUsersQuery = ({
  wheres,
  order,
}: {
  wheres?: Where<Schemas['users']>[][];
  order?: Order<Schemas['users']>[];
}): RequiredQueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: '',
    values: [],
  };

  queryConfig.text = `select
	u.id ,
	u.nickname ,
	u.image ,
	u.banner ,
	u.desc ,
	u.location,
	u.birth ,
	u.refer ,
	u.verified ,
	u.regist ,
	case
		when follower.value is not null then follower.value
		else '[]'
	end as "Followers",
	case
		when following.value is not null then following.value
		else '[]'
	end as "Followings",
	json_build_object('Followers',
	case
		when follower.count is not null then follower.count
		else '0'
	end,
	'Followings',
	case
		when following.count is not null then following.count
		else '0'
	end
	) as _count
from
	users u
left outer join (
	select
		source,
		json_agg( row_to_json(f)::jsonb-'source') as value,
		count(*) as count
	from
		(
		select
			source,
			target as id
		from
			follow) f
	group by
		source) following on
	following.source = u.id
left outer join (
	select
		target,
		json_agg( row_to_json(f)::jsonb-'target') as value,
		count(*) as count
	from
		(
		select
			source as id,
			target
		from
			follow) f
	group by
		target) follower on
	follower.target = u.id
`;

  const { text, values } = makeWhere(queryConfig, wheres);
  queryConfig.text = text;
  queryConfig.values = values;

  queryConfig.text = makeOrder(queryConfig.text, order);

  return queryConfig;
};

export const selectPostsQuery = ({
  userid,
  parentid,
  originalid,
  quote,
  filter,
}: {
  userid?: string;
  parentid?: number;
  originalid?: number;
  quote?: boolean;
  filter?: 'all' | 'media';
}) => {
  const queryConfig: RequiredQueryConfig = {
    text: '',
    values: [],
  };
  const wheres: Where<Schemas['advancedpost']>[][] = [[]];
  let index = 0;

  if (typeof userid !== 'undefined') {
    wheres[index].push({ field: 'userid', value: userid });
  }
  if (typeof parentid !== 'undefined') {
    wheres[index].push({ field: 'parentid', value: parentid });
  }
  if (typeof originalid !== 'undefined') {
    wheres[index].push({ field: 'originalid', value: originalid });
  }
  if (typeof quote !== 'undefined') {
    wheres[index].push({ field: 'quote', value: quote });
  }
  if (filter === 'media') {
    wheres[index].push({ field: 'images', operator: '<>', value: '[]' });
  }

  queryConfig.text = makeSelectField('advancedpost');
  const { text, values } = makeWhere(queryConfig, wheres);
  queryConfig.text = text;
  queryConfig.values = values;

  return queryConfig;
};

export const selectListsQuery = ({
  sessionid,
  id,
  userid,
  make,
  filter,
  q,
}: {
  sessionid: string;
  id?: Schemas['lists']['id'];
  userid?: Schemas['lists']['userid'];
  make?: Schemas['lists']['make'];
  filter?: 'all' | 'own' | 'memberships';
  q?: string;
}) => {
  let queryConfig: RequiredQueryConfig = {
    text: '',
    values: [sessionid],
  };

  queryConfig.text = `select
	al.id,
	al.userid,
	al."User",
	al.name,
	al.description,
	al.banner,
	al.thumbnail,
	al.make,
	al.createat,
	al."Member",
	al."Follower",
	al."UnShow",
	al."Posts",
	case
		when ld.id is not null then true
		else false
	end as "Pinned"
from
	advancedlists al
left outer join (
	select
		id,
		listid
	from
		listsdetail
	where
		type = 'pinned'
		and userid = $1) ld on
	ld.listid = al.id
`;

  const where: Where<Schemas['advancedlists']>[] = [];
  if (typeof id !== 'undefined') {
    where.push({ tableAlias: 'al', field: 'id', value: id });
  }
  if (typeof userid !== 'undefined') {
    where.push({ field: 'userid', value: userid });
  }
  if (typeof make !== 'undefined') {
    where.push({ field: 'make', value: make });
  }
  if (typeof q !== 'undefined') {
    where.push({
      field: 'name',
      operator: 'ilike',
      value: `%${decodeURIComponent(q)}%`,
    });
  }

  if (filter === 'all') {
    const { text, values } = makeWhere(queryConfig, [where], 2);
    queryConfig.text = text;
    queryConfig.values = values;

    queryConfig.text += `\tOR al."Follower"::text like $${
      queryConfig.values.length + 1
    }\n`;
    queryConfig.values.push(`%"${userid}"%`);
  } else if (filter === 'own' || typeof filter === 'undefined') {
    const { text, values } = makeWhere(queryConfig, [where], 2);
    queryConfig.text = text;
    queryConfig.values = values;
  } else if (filter === 'memberships') {
    queryConfig.text += 'WHERE\n';
    queryConfig.text += `\tal."Member"::text like $${
      queryConfig.values.length + 1
    }\n`;
    queryConfig.values.push(`%"${userid}"%`);
  }

  queryConfig.text += 'ORDER BY\n';
  if (sessionid === userid) {
    queryConfig.text += '\t"Pinned" desc,\n';
  }
  queryConfig.text += '\tcreateat desc\n';

  return queryConfig;
};

export const insertUsersQuery = ({
  id,
  password,
  nickname,
  birth,
  image,
}: Pick<
  Schemas['users'],
  'id' | 'password' | 'nickname' | 'birth' | 'image'
>) => {
  const queryConfig = makeInsertField(
    'users',
    [id, password, nickname, birth ? birth : null, image],
    ['id', 'password', 'nickname', 'birth', 'image']
  );

  return queryConfig;
};

export const updateUsersQuery = ({
  id,
  nickname,
  desc,
  location,
  birth,
  refer,
  image,
  banner,
  verified,
}: {
  id: string;
  nickname?: string;
  desc?: string;
  location?: string;
  birth?: Birth | null;
  refer?: string;
  image?: string;
  banner?: string;
  verified?: Verified;
}) => {
  const fields: (keyof Schemas['users'])[] = [];
  const values: any[] = [];
  const wheres: Where<Schemas['users']>[][] = [[{ field: 'id', value: id }]];
  if (typeof nickname !== 'undefined') {
    fields.push('nickname');
    values.push(nickname);
  }
  if (typeof desc !== 'undefined') {
    fields.push('desc');
    values.push(desc);
  }
  if (typeof location !== 'undefined') {
    fields.push('location');
    values.push(location);
  }
  if (typeof birth !== 'undefined') {
    fields.push('birth');
    values.push(birth);
  }
  if (typeof refer !== 'undefined') {
    fields.push('refer');
    values.push(refer);
  }
  if (typeof image !== 'undefined') {
    fields.push('image');
    values.push(image);
  }
  if (typeof banner !== 'undefined') {
    fields.push('banner');
    values.push(banner !== '' ? banner : null);
  }
  if (typeof verified !== 'undefined') {
    fields.push('verified');
    values.push(verified);
  }

  let queryConfig = makeUpdateField('users', { fields, values }, wheres);

  return queryConfig;
};
